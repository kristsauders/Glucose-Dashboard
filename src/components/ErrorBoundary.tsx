import { Component } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: any;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Special handling for React DevTools profiler errors (development only)
    // These errors occur when React tries to clone large data structures for profiling
    // They don't affect functionality and can be safely ignored
    if (
      error.name === 'DataCloneError' ||
      error.message?.includes('Data cannot be cloned') ||
      error.message?.includes('out of memory') ||
      error.message?.includes('logComponentRender') ||
      error.message?.includes('Performance') ||
      error.message?.includes('Should not already be working') ||
      error.message?.includes('performWorkOnRoot')
    ) {
      console.warn('React DevTools profiler error detected - this is non-critical and can be ignored.');
      console.warn('To prevent this: disable React DevTools profiler, use production build, or reduce data size.');

      // Don't show error UI for profiler errors - just log and continue
      // Reset error state to prevent crash
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
      });
      return;
    }

    // For real errors, update state to show error UI
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReload = () => {
    // Clear error state and reload the page
    window.location.reload();
  };

  handleReset = () => {
    // Just clear the error state to try rendering again
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="max-w-lg w-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-destructive/10 rounded-lg">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <CardTitle>Something went wrong</CardTitle>
                  <CardDescription>
                    The app encountered an unexpected error
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {this.state.error && (
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-sm font-mono text-muted-foreground break-all">
                    {this.state.error.message}
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={this.handleReload} className="flex-1">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reload Page
                </Button>
                <Button onClick={this.handleReset} variant="outline" className="flex-1">
                  Try Again
                </Button>
              </div>

              <p className="text-sm text-muted-foreground">
                If this problem persists, try refreshing your browser or clearing your cache.
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
