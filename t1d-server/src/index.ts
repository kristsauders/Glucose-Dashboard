import { startServer } from './api/server.js';
import { testConnection } from './config/database.js';
import { proactiveMonitor } from './services/proactive-monitor.js';
import { patternDetector } from './services/pattern-detector.js';
import { discordBot } from './services/discord-bot.js';
import { libreViewPoller } from './services/libreviewPoller.js';
import { reportingService } from './services/reporting-service.js';
import type { Server } from 'http';

let httpServer: Server | null = null;

async function main() {
  try {
    // Test database connection
    console.log('🔗 Testing database connection...');
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.error('❌ Failed to connect to database');
      console.error('   Make sure PostgreSQL is running: npm run docker:up');
      process.exit(1);
    }

    console.log('✅ Database connected');

    // Start server
    httpServer = await startServer();

    // Start proactive monitoring service
    console.log('🤖 Starting proactive monitoring...');
    proactiveMonitor.start();

    // Start pattern detection service
    console.log('🔍 Starting pattern detection...');
    patternDetector.start();

    // Start reporting service
    console.log('📊 Starting reporting service...');
    reportingService.start();

    // Start Discord bot
    console.log('💬 Starting Discord bot...');
    await discordBot.start();

    // Setup graceful shutdown
    setupGracefulShutdown();
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

function setupGracefulShutdown() {
  const shutdown = async (signal: string) => {
    console.log(`\n\n📴 Received ${signal}, shutting down gracefully...`);

    try {
      // Stop accepting new connections
      if (httpServer) {
        console.log('  ⏳ Closing HTTP server...');

        // Force close all connections after 2 seconds
        const forceCloseTimer = setTimeout(() => {
          console.log('  ⚠️  Force closing connections...');
          (httpServer as any).closeAllConnections?.();
        }, 2000);

        await new Promise<void>((resolve) => {
          httpServer!.close(() => {
            clearTimeout(forceCloseTimer);
            console.log('  ✓ HTTP server closed');
            resolve();
          });
        });
      }

      // Stop Discord bot
      console.log('  ⏳ Stopping Discord bot...');
      await discordBot.stop();

      // Stop proactive monitor
      console.log('  ⏳ Stopping proactive monitor...');
      proactiveMonitor.stop();

      // Stop pattern detector
      console.log('  ⏳ Stopping pattern detector...');
      patternDetector.stop();

      // Stop reporting service
      console.log('  ⏳ Stopping reporting service...');
      reportingService.stop();

      // Stop LibreView polling
      console.log('  ⏳ Stopping LibreView polling...');
      libreViewPoller.stopAll();

      console.log('✅ Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
