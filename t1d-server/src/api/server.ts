import express from 'express';
import cors from 'cors';
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

// Error handler (must be last)
app.use(errorHandler);

export function startServer() {
  const port = parseInt(env.PORT);

  return new Promise<any>((resolve) => {
    const server = app.listen(port, '0.0.0.0', async () => {
      console.log('');
      console.log('╔════════════════════════════════════════════════════════╗');
      console.log('║                                                        ║');
      console.log('║              T1D AI Assistant Server                  ║');
      console.log('║                                                        ║');
      console.log('╚════════════════════════════════════════════════════════╝');
      console.log('');
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
    server.on('connection', (conn) => {
      connections.add(conn);
      conn.on('close', () => {
        connections.delete(conn);
      });
    });

    // Add method to forcefully close all connections
    (server as any).closeAllConnections = () => {
      for (const conn of connections) {
        conn.destroy();
      }
      connections.clear();
    };
  });
}
