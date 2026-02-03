import { query } from '../src/config/database.js';

async function checkUsers() {
  try {
    const result = await query(
      "SELECT id, email, timezone FROM users",
      []
    );

    console.log('Users in database:');
    result.rows.forEach(user => {
      console.log('- Email:', user.email);
      console.log('  Timezone:', user.timezone);
      console.log('  ID:', user.id);
      console.log('');
    });
  } catch (error) {
    console.error('Error:', error);
  }

  process.exit(0);
}

checkUsers();
