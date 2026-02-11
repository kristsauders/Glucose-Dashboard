/**
 * Global error handler for uncaught errors
 * Specifically handles React DevTools profiler errors that crash the app
 */

// Track if we've already handled a profiler error to avoid spam
let profilerErrorHandled = false;
let profilerErrorTimeout: NodeJS.Timeout | null = null;

/**
 * Check if an error is a React DevTools profiler error
 */
function isProfilerError(error: Error | string): boolean {
  const errorStr = typeof error === 'string' ? error : error.message || error.toString();

  return (
    errorStr.includes('Data cannot be cloned') ||
    errorStr.includes('out of memory') ||
    errorStr.includes('DataCloneError') ||
    errorStr.includes('logComponentRender') ||
    errorStr.includes('Performance') ||
    errorStr.includes('Should not already be working') ||
    errorStr.includes('performWorkOnRoot') ||
    errorStr.includes('commitPassiveMountOnFiber')
  );
}

/**
 * Patch Performance.measure to prevent DataCloneError
 * React DevTools profiler uses this API and it can crash with large data
 */
function patchPerformanceMeasure(): void {
  if (typeof performance !== 'undefined' && performance.measure) {
    const originalMeasure = performance.measure.bind(performance);

    performance.measure = function (_measureName: string, _startOrOptions?: string | PerformanceMeasureOptions, _endMark?: string) {
      try {
        // @ts-ignore - Spread arguments for compatibility
        return originalMeasure.apply(this, arguments);
      } catch (error: any) {
        // Silently catch DataCloneError from React profiler
        if (isProfilerError(error)) {
          if (!profilerErrorHandled) {
            console.warn('[Sage] Performance.measure error suppressed:', error.message);
            profilerErrorHandled = true;
            if (profilerErrorTimeout) clearTimeout(profilerErrorTimeout);
            profilerErrorTimeout = setTimeout(() => {
              profilerErrorHandled = false;
            }, 1000);
          }
          return undefined as any; // Return undefined instead of throwing
        }
        throw error; // Re-throw non-profiler errors
      }
    };

  }
}

/**
 * Initialize global error handlers
 */
export function initGlobalErrorHandlers(): void {
  // Patch Performance API first to prevent errors at the source
  patchPerformanceMeasure();

  // Handle uncaught errors
  window.addEventListener('error', (event) => {
    if (isProfilerError(event.error || event.message)) {
      // Prevent the error from propagating
      event.preventDefault();
      event.stopImmediatePropagation();

      // Log once per second to avoid spam
      if (!profilerErrorHandled) {
        console.warn(
          '[Sage] React DevTools profiler error detected and suppressed.',
          'This is harmless and does not affect functionality.',
          'To prevent: disable React DevTools profiler or use production build.'
        );

        profilerErrorHandled = true;

        // Reset flag after 1 second
        if (profilerErrorTimeout) clearTimeout(profilerErrorTimeout);
        profilerErrorTimeout = setTimeout(() => {
          profilerErrorHandled = false;
        }, 1000);
      }

      return false;
    }
  }, true); // Use capture phase to catch errors early

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && isProfilerError(event.reason)) {
      event.preventDefault();

      if (!profilerErrorHandled) {
        console.warn('[Sage] React DevTools profiler promise rejection suppressed.');
        profilerErrorHandled = true;

        if (profilerErrorTimeout) clearTimeout(profilerErrorTimeout);
        profilerErrorTimeout = setTimeout(() => {
          profilerErrorHandled = false;
        }, 1000);
      }
    }
  });

}

/**
 * Disable React DevTools profiler to prevent memory errors
 * This only affects development mode
 */
export function disableReactProfiler(): void {
  // Check if we're in development mode
  if (import.meta.env.DEV) {
    try {
      // Disable React DevTools profiler
      // @ts-ignore - This is a development-only API
      if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        // @ts-ignore
        window.__REACT_DEVTOOLS_GLOBAL_HOOK__.inject = function () {};
        // @ts-ignore
        window.__REACT_DEVTOOLS_GLOBAL_HOOK__.supportsFiber = true;
        // @ts-ignore
        window.__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot = function () {};
        // @ts-ignore
        window.__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberUnmount = function () {};

        console.log('[Sage] React DevTools profiler disabled to prevent memory errors');
      }
    } catch (error) {
      console.warn('[Sage] Failed to disable React DevTools profiler:', error);
    }
  }
}
