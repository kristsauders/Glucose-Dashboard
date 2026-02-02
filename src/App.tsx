import { useState, useEffect, useCallback } from 'react';
import type { GlucoseReading } from './types/glucose';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { apiService } from './services/api';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [readings, setReadings] = useState<GlucoseReading[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is authenticated
    const authenticated = apiService.isAuthenticated();
    setIsAuthenticated(authenticated);

    if (authenticated) {
      // Load glucose data from backend
      loadGlucoseData();
    } else {
      setIsLoading(false);
    }
  }, []);

  const loadGlucoseData = async () => {
    try {
      const data = await apiService.getGlucoseReadings();
      setReadings(data);
    } catch (err) {
      console.error('Failed to load glucose data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthenticated = () => {
    setIsAuthenticated(true);
    setIsLoading(true);
    loadGlucoseData();
  };

  const handleDataUpdated = useCallback(() => {
    // Reload data from backend
    loadGlucoseData();
  }, []);

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

  return <Dashboard readings={readings} onDataUpdated={handleDataUpdated} />;
}

export default App;
