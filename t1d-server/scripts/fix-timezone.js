import { query } from '../src/config/database.js';

async function fixTimezone() {
  try {
    const result = await query(
      "UPDATE users SET timezone = 'America/New_York' WHERE email = 'you@example.com' RETURNING id, email, timezone",
      []
    );

    if (result.rows.length > 0) {
      console.log('✓ Updated timezone for:', result.rows[0].email);
      console.log('  New timezone:', result.rows[0].timezone);
    } else {
      console.log('⚠ No user found with that email');
    }
  } catch (error) {
    console.error('Error:', error);
  }

  process.exit(0);
}

fixTimezone();
