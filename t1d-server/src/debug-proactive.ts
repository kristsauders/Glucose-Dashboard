import { query } from './config/database.js';
import { proactiveMonitor } from './services/proactive-monitor.js';

async function debugProactiveAnalysis() {
  try {
    // Get your user
    const userResult = await query(
      `SELECT id, email, diagnosis_type, diagnosis_date, timezone, discord_user_id
       FROM users
       WHERE email = 'you@example.com'`,
      []
    );

    if (userResult.rows.length === 0) {
      console.log('User not found');
      return;
    }

    const user = userResult.rows[0];
    console.log('Testing proactive analysis for:', user.email);
    console.log('User ID:', user.id);
    console.log('\n--- Running proactive monitor analysis ---\n');

    // Call the actual proactive monitor method
    await (proactiveMonitor as any).runProactiveAnalysis(user);

    console.log('\n--- Test complete ---\n');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

debugProactiveAnalysis();
