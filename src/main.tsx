import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './components/ThemeProvider'
import { ErrorBoundary } from './components/ErrorBoundary'

// Disable React profiling to prevent memory issues
if (typeof window !== 'undefined') {
  (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__?.inject?.({
    supportsProfiling: false,
  });
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <ThemeProvider defaultTheme="system" storageKey="sage-theme">
      <App />
    </ThemeProvider>
  </ErrorBoundary>,
)
