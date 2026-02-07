// MUST be first - disable React DevTools completely to prevent memory issues
if (typeof window !== 'undefined') {
  // Completely stub out React DevTools to prevent memory leaks
  (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    checkDCE: () => {},
    inject: () => {},
    onCommitFiberRoot: () => {},
    onCommitFiberUnmount: () => {},
    onPostCommitFiberRoot: () => {},
    supportsFiber: false,
    supportsProfiling: false,
  };
}

import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './components/ThemeProvider'
import { ErrorBoundary } from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <ThemeProvider defaultTheme="system" storageKey="sage-theme">
      <App />
    </ThemeProvider>
  </ErrorBoundary>,
)
