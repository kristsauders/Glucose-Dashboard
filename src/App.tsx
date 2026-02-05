import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import type { GlucoseReading } from './types/glucose';
import { Auth } from './components/Auth';
import { apiService } from './services/api';

// Lazy load routes for better performance
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const ChatOnly = lazy(() => import('./pages/ChatOnly').then(m => ({ default: m.ChatOnly })));

function AppContent() {
  const location = useLocation();
  const [readings, setReadings] = useState<GlucoseReading[]>([]);

  // Only load glucose data when on dashboard route
  useEffect(() => {
    if (location.pathname === '/') {
      loadGlucoseData();
    }
  }, [location.pathname]);

  const loadGlucoseData = async () => {
    try {
      const data = await apiService.getGlucoseReadings();
      setReadings(data);
    } catch (err) {
      console.error('Failed to load glucose data:', err);
    }
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
      <Routes>
        <Route path="/" element={<Dashboard readings={readings} onDataUpdated={handleDataUpdated} />} />
        <Route path="/chat" element={<ChatOnly />} />
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
