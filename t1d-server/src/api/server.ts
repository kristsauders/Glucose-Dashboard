import express from 'express';
import cors from 'cors';
import compression from 'compression';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';
import { testConnection } from '../config/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';
import { libreViewPoller } from '../services/libreviewPoller.js';
import { researchMonitor } from '../services/research-monitor.js';
import authRoutes from './routes/auth.js';
import glucoseRoutes from './routes/glucose.js';
import importRoutes from './routes/import.js';
import settingsRoutes from './routes/settings.js';
import chatRoutes from './routes/chat.js';
import conversationsRoutes from './routes/conversations.js';
import logsRoutes from './routes/logs.js';
import notificationRoutes from './routes/notifications.js';
import voiceRoutes from './routes/voice.js';
import reportsRoutes from './routes/reports.js';
import quickActionsRoutes from './routes/quick-actions.js';
import healthRoutes from './routes/health.js';

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
// Enable gzip compression for all responses EXCEPT SSE endpoints (which need real-time streaming)
app.use(compression({
  filter: (req, res) => {
    // Don't compress Server-Sent Events
    if (req.path === '/api/chat/stream') {
      return false;
    }
    // Use default compression filter for everything else
    return compression.filter(req, res);
  }
}));
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
app.use('/api/voice', voiceRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/quick-actions', quickActionsRoutes);
app.use('/api/apple-health', healthRoutes);

// Admin endpoint to manually trigger proactive check (for testing)
// Development only - no auth required for easier testing
app.post('/api/admin/trigger-proactive-check', async (req, res) => {
  try {
    // Only allow in development
    if (env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Not available in production' });
    }

    console.log('📋 Manual proactive check triggered (FORCE MODE)');

    // Import proactiveMonitor
    const { proactiveMonitor } = await import('../services/proactive-monitor.js');

    // Trigger check in background with force=true to bypass cooldown/sleep/data checks
    (proactiveMonitor as any).checkAllUsers(true).catch((err: any) => {
      console.error('Error in manual proactive check:', err);
    });

    res.json({
      success: true,
      message: 'Proactive check triggered. Check server logs for progress.'
    });
  } catch (error) {
    console.error('Failed to trigger proactive check:', error);
    res.status(500).json({ error: 'Failed to trigger proactive check' });
  }
});

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

          // Start research monitoring
          researchMonitor.start();

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

          // Start research monitoring
          researchMonitor.start();

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
