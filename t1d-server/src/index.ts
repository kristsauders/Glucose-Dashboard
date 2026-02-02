import { startServer } from './api/server.js';
import { testConnection } from './config/database.js';

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
    await startServer();
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

main();
