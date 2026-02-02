import { useState, useEffect, useCallback } from 'react';
import type { GlucoseReading } from './types/glucose';
import { loadGlucoseData } from './lib/csvParser';
import { CSVUpload } from './components/CSVUpload';
import { Dashboard } from './components/Dashboard';

function App() {
  const [readings, setReadings] = useState<GlucoseReading[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Try to load existing data from localStorage
    const savedData = loadGlucoseData();
    if (savedData && savedData.length > 0) {
      setReadings(savedData);
    }
    setIsLoading(false);
  }, []);

  const handleDataLoaded = (newReadings: GlucoseReading[]) => {
    setReadings(newReadings);
  };

  const handleNewUpload = () => {
    setReadings(null);
  };

  const handleDataUpdated = useCallback(() => {
    // Reload data from localStorage (used when live mode merges new data)
    const savedData = loadGlucoseData();
    if (savedData && savedData.length > 0) {
      setReadings(savedData);
    }
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

  if (!readings || readings.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <CSVUpload onDataLoaded={handleDataLoaded} />
      </div>
    );
  }

  return <Dashboard readings={readings} onNewUpload={handleNewUpload} onDataUpdated={handleDataUpdated} />;
}

export default App;
