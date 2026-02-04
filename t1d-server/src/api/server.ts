import express from 'express';
import cors from 'cors';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';
import { testConnection } from '../config/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import { libreViewPoller } from '../services/libreviewPoller.js';
import authRoutes from './routes/auth.js';
import glucoseRoutes from './routes/glucose.js';
import importRoutes from './routes/import.js';
import settingsRoutes from './routes/settings.js';
import chatRoutes from './routes/chat.js';
import conversationsRoutes from './routes/conversations.js';
import logsRoutes from './routes/logs.js';
import notificationRoutes from './routes/notifications.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to load HTTPS certificates if they exist
function getHttpsConfig() {
  // Certificates are in the parent glucose-dashboard directory, not in t1d-server
  const certPath = path.resolve(__dirname, '../../../cert/cert.pem');
  const keyPath = path.resolve(__dirname, '../../../cert/key.pem');

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  }

  return null;
}

const app = express();

// Track active connections for forceful shutdown
const connections = new Set<any>();

// Middleware
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/api/health', async (req, res) => {
  const dbHealthy = await testConnection();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbHealthy ? 'connected' : 'disconnected',
    environment: env.NODE_ENV,
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/glucose', glucoseRoutes);
app.use('/api/import', importRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/notifications', notificationRoutes);

// Serve static files in production
if (env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../../../dist');

  // Serve static assets
  app.use(express.static(distPath));

  // Handle client-side routing - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Error handler (must be last)
app.use(errorHandler);

export function startServer() {
  const port = parseInt(env.PORT);
  const httpsConfig = getHttpsConfig();

  return new Promise<any>((resolve) => {
    const server = httpsConfig
      ? https.createServer(httpsConfig, app)
      : app;

    const serverInstance = httpsConfig
      ? server.listen(port, '0.0.0.0', async () => {
          console.log('');
          console.log('╔════════════════════════════════════════════════════════╗');
          console.log('║                                                        ║');
          console.log('║              T1D AI Assistant Server                  ║');
          console.log('║                                                        ║');
          console.log('╚════════════════════════════════════════════════════════╝');
          console.log('');
          console.log('✓ HTTPS enabled with local certificates');
          console.log(`✓ Server running on https://localhost:${port}`);
          console.log(`✓ Health check: https://localhost:${port}/api/health`);
          console.log(`✓ Environment: ${env.NODE_ENV}`);
          console.log(`✓ AI Provider: ${env.AI_PROVIDER}`);
          console.log('');

          // Resume LibreView polling for users with saved credentials
          await libreViewPoller.resumeAllPolling();

          console.log('Press Ctrl+C to stop');
          console.log('════════════════════════════════════════════════════════');
          console.log('');
          resolve(server);
        })
      : (server as any).listen(port, '0.0.0.0', async () => {
          console.log('');
          console.log('╔════════════════════════════════════════════════════════╗');
          console.log('║                                                        ║');
          console.log('║              T1D AI Assistant Server                  ║');
          console.log('║                                                        ║');
          console.log('╚════════════════════════════════════════════════════════╝');
          console.log('');
          console.log('ℹ HTTPS certificates not found, running in HTTP mode');
          console.log(`✓ Server running on http://localhost:${port}`);
          console.log(`✓ Health check: http://localhost:${port}/api/health`);
          console.log(`✓ Environment: ${env.NODE_ENV}`);
          console.log(`✓ AI Provider: ${env.AI_PROVIDER}`);
          console.log('');

          // Resume LibreView polling for users with saved credentials
          await libreViewPoller.resumeAllPolling();

          console.log('Press Ctrl+C to stop');
          console.log('════════════════════════════════════════════════════════');
          console.log('');
          resolve(server);
        });

    // Track connections for forceful shutdown
    serverInstance.on('connection', (conn) => {
      connections.add(conn);
      conn.on('close', () => {
        connections.delete(conn);
      });
    });

    // Add method to forcefully close all connections
    (serverInstance as any).closeAllConnections = () => {
      for (const conn of connections) {
        conn.destroy();
      }
      connections.clear();
    };
  });
}
