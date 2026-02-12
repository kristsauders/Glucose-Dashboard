import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// Try to load HTTPS certificates if they exist
function getHttpsConfig() {
  const certPath = path.resolve(__dirname, 'cert/cert.pem')
  const keyPath = path.resolve(__dirname, 'cert/key.pem')

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    console.log('✓ HTTPS enabled with local certificates')
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    }
  }

  console.log('ℹ HTTPS certificates not found, running in HTTP mode')
  console.log('  For iOS notifications, generate certificates with:')
  console.log('  mkcert -key-file .cert/key.pem -cert-file .cert/cert.pem 192.168.202.132 localhost')
  return undefined
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Increase chunk size warning limit to 1000kb
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching
        manualChunks: {
          // React core
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // Large UI libraries
          'ui-vendor': ['framer-motion', 'recharts'],
          // Markdown rendering
          'markdown-vendor': ['react-markdown', 'remark-gfm', 'rehype-highlight'],
          // Utilities
          'utils-vendor': ['date-fns', 'papaparse', 'clsx', 'tailwind-merge'],
        },
      },
    },
    // Enable minification with esbuild (faster than terser)
    minify: 'esbuild',
    // Generate source maps for debugging (optional, remove for smaller builds)
    sourcemap: false,
  },
  server: {
    host: true, // Listen on all network interfaces
    port: 5173,
    https: getHttpsConfig(),
    // Proxy API requests to backend server
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
    },
    // Improve HMR stability
    hmr: {
      protocol: 'ws',
      // Increase timeout to prevent disconnections
      timeout: 60000,
    },
    watch: {
      // Polling settings - adjust if needed
      usePolling: false,
      // Debounce interval to prevent rapid rebuilds
      interval: 100,
    },
  },
  // Optimize dependencies to reduce crashes
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'framer-motion',
      'react-markdown',
      'date-fns',
    ],
  },
})
