import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import type { GlucoseReading } from './types/glucose';
import { Auth } from './components/Auth';
import { apiService } from './services/api';
import { Alert, AlertDescription } from './components/ui/alert';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './components/ui/button';

// Lazy load routes for better performance
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const ChatOnly = lazy(() => import('./pages/ChatOnly').then(m => ({ default: m.ChatOnly })));
const Voice = lazy(() => import('./pages/Voice').then(m => ({ default: m.Voice })));
const Reports = lazy(() => import('./pages/Reports').then(m => ({ default: m.Reports })));

function AppContent() {
  const location = useLocation();
  const [readings, setReadings] = useState<GlucoseReading[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // Only load glucose data when on dashboard route
  useEffect(() => {
    if (location.pathname === '/') {
      loadGlucoseData();
    }
  }, [location.pathname]);

  const loadGlucoseData = async () => {
    try {
      setDataError(null);
      const data = await apiService.getGlucoseReadings();
      setReadings(data);
    } catch (err: any) {
      console.error('Failed to load glucose data:', err);
      setDataError(err.message || 'Failed to load glucose data. Please check your connection.');
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    await loadGlucoseData();
    setIsRetrying(false);
  };

  const handleDataUpdated = useCallback(() => {
    // Reload data from backend
    loadGlucoseData();
  }, []);

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      {dataError && location.pathname === '/' && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md px-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-2">
              <span className="flex-1">{dataError}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                disabled={isRetrying}
                className="ml-2 bg-background"
              >
                {isRetrying ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Retry
                  </>
                )}
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}
      <Routes>
        <Route path="/" element={<Dashboard readings={readings} onDataUpdated={handleDataUpdated} />} />
        <Route path="/chat" element={<ChatOnly />} />
        <Route path="/voice" element={<Voice />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is authenticated
    const authenticated = apiService.isAuthenticated();
    setIsAuthenticated(authenticated);
    setIsLoading(false);
  }, []);

  const handleAuthenticated = () => {
    setIsAuthenticated(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Auth onAuthenticated={handleAuthenticated} />;
  }

  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
