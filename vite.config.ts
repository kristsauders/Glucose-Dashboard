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
  server: {
    host: true, // Listen on all network interfaces
    port: 5173,
    https: getHttpsConfig(),
  },
})
