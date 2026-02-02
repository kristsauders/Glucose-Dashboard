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

const app = express();

// Middleware
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));
app.use(express.json());

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

// Error handler (must be last)
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n\n📴 Shutting down gracefully...');
  libreViewPoller.stopAll();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n\n📴 Shutting down gracefully...');
  libreViewPoller.stopAll();
  process.exit(0);
});

export function startServer() {
  const port = parseInt(env.PORT);

  return new Promise<void>((resolve) => {
    app.listen(port, '0.0.0.0', () => {
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
      console.log('Press Ctrl+C to stop');
      console.log('════════════════════════════════════════════════════════');
      console.log('');
      resolve();
    });
  });
}
