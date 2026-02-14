import { query } from '../src/config/database.js';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

interface InsulinDose {
  id: string;
  user_id: string;
  timestamp: Date;
  units: number;
  insulin_type: string;
  brand_name: string | null;
  purpose: string | null;
  notes: string | null;
  source: string;
  created_at: Date;
}

async function main() {
  console.log('\n=== Insulin Duplicate Debugger ===\n');

  // Get user ID
  const userIdInput = await ask('Enter user ID (or press enter to list users): ');

  if (!userIdInput.trim()) {
    const users = await query('SELECT id, email FROM users ORDER BY email');
    console.log('\nAvailable users:');
    users.rows.forEach((user: any, index: number) => {
      console.log(`${index + 1}. ${user.email} (${user.id})`);
    });
    console.log('');
    rl.close();
    return;
  }

  const userId = userIdInput.trim();

  // Get date range
  const startDateInput = await ask('Enter start date (YYYY-MM-DD) [default: 2025-01-25]: ');
  const endDateInput = await ask('Enter end date (YYYY-MM-DD) [default: 2025-01-28]: ');

  const startDate = startDateInput.trim() || '2025-01-25';
  const endDate = endDateInput.trim() || '2025-01-28';

  console.log(`\nQuerying insulin doses from ${startDate} to ${endDate}...\n`);

  // Fetch all insulin doses in the date range
  const result = await query<InsulinDose>(
    `SELECT id, user_id, timestamp, units, insulin_type, brand_name, purpose, notes, source, created_at
     FROM insulin_doses
     WHERE user_id = $1
       AND timestamp >= $2::date
       AND timestamp < ($3::date + interval '1 day')
     ORDER BY timestamp ASC`,
    [userId, startDate, endDate]
  );

  const doses = result.rows;

  if (doses.length === 0) {
    console.log('No insulin doses found in this date range.');
    rl.close();
    return;
  }

  // Group by date
  const dosesByDate = new Map<string, InsulinDose[]>();
  doses.forEach(dose => {
    const date = new Date(dose.timestamp).toISOString().split('T')[0];
    if (!dosesByDate.has(date)) {
      dosesByDate.set(date, []);
    }
    dosesByDate.get(date)!.push(dose);
  });

  // Display doses grouped by date
  console.log('=== Insulin Doses by Date ===\n');

  for (const [date, dateDoses] of Array.from(dosesByDate.entries()).sort()) {
    const totalUnits = dateDoses.reduce((sum, d) => sum + d.units, 0);
    console.log(`\n📅 ${date} - Total: ${totalUnits}u (${dateDoses.length} dose${dateDoses.length > 1 ? 's' : ''})`);

    dateDoses.forEach((dose, index) => {
      const time = new Date(dose.timestamp).toLocaleTimeString();
      const createdAt = new Date(dose.created_at).toLocaleString();
      console.log(`  ${index + 1}. ${dose.units}u ${dose.insulin_type}${dose.brand_name ? ` (${dose.brand_name})` : ''}`);
      console.log(`     Time: ${time}`);
      console.log(`     Source: ${dose.source}`);
      console.log(`     Created: ${createdAt}`);
      console.log(`     ID: ${dose.id}`);
      if (dose.notes) console.log(`     Notes: ${dose.notes}`);
    });

    // Check for potential duplicates
    if (dateDoses.length > 1) {
      const basalDoses = dateDoses.filter(d => {
        const type = d.insulin_type.toLowerCase();
        return type.includes('tresiba') || type.includes('basal') || type.includes('lantus') ||
               type.includes('levemir') || type.includes('long');
      });

      if (basalDoses.length > 1) {
        // Check if they have the same units
        const sameUnits = basalDoses.every(d => d.units === basalDoses[0].units);
        if (sameUnits) {
          console.log(`\n  ⚠️  POTENTIAL DUPLICATE: ${basalDoses.length} basal doses with ${basalDoses[0].units}u each`);

          // Check timestamps
          const timestamps = basalDoses.map(d => new Date(d.timestamp).getTime());
          const timeDiffs = timestamps.slice(1).map((t, i) => Math.abs(t - timestamps[i]) / 1000 / 60); // minutes

          if (timeDiffs.some(diff => diff < 60)) {
            console.log(`  ⚠️  Doses are within 60 minutes of each other - likely duplicate!`);
          }
        }
      }
    }
  }

  console.log('\n\n=== Actions ===\n');
  console.log('1. Delete a specific dose by ID');
  console.log('2. Keep only one dose per day (delete duplicates)');
  console.log('3. View dose details');
  console.log('4. Exit');

  const action = await ask('\nChoose action (1-4): ');

  switch (action.trim()) {
    case '1': {
      const doseId = await ask('Enter dose ID to delete: ');
      const confirm = await ask(`Are you sure you want to delete dose ${doseId}? (yes/no): `);

      if (confirm.toLowerCase() === 'yes') {
        await query('DELETE FROM insulin_doses WHERE id = $1 AND user_id = $2', [doseId, userId]);
        console.log('✓ Dose deleted successfully');
      } else {
        console.log('Cancelled');
      }
      break;
    }

    case '2': {
      console.log('\nThis will keep the earliest dose for each day and delete later duplicates.');
      const confirm = await ask('Continue? (yes/no): ');

      if (confirm.toLowerCase() === 'yes') {
        let deletedCount = 0;

        for (const [date, dateDoses] of dosesByDate.entries()) {
          if (dateDoses.length > 1) {
            // Group by insulin type and units to identify true duplicates
            const groupedDoses = new Map<string, InsulinDose[]>();

            dateDoses.forEach(dose => {
              const key = `${dose.insulin_type}-${dose.units}`;
              if (!groupedDoses.has(key)) {
                groupedDoses.set(key, []);
              }
              groupedDoses.get(key)!.push(dose);
            });

            // For each group with duplicates, keep the earliest
            for (const [key, group] of groupedDoses.entries()) {
              if (group.length > 1) {
                // Sort by timestamp, keep first, delete rest
                const sorted = group.sort((a, b) =>
                  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                );

                const toDelete = sorted.slice(1);
                console.log(`\n${date}: Keeping earliest ${sorted[0].units}u dose, deleting ${toDelete.length} duplicate(s)`);

                for (const dose of toDelete) {
                  await query('DELETE FROM insulin_doses WHERE id = $1', [dose.id]);
                  console.log(`  ✓ Deleted dose ID ${dose.id} (${new Date(dose.timestamp).toLocaleTimeString()})`);
                  deletedCount++;
                }
              }
            }
          }
        }

        console.log(`\n✓ Deleted ${deletedCount} duplicate dose(s)`);
      } else {
        console.log('Cancelled');
      }
      break;
    }

    case '3': {
      const doseId = await ask('Enter dose ID to view: ');
      const doseResult = await query<InsulinDose>(
        'SELECT * FROM insulin_doses WHERE id = $1',
        [doseId]
      );

      if (doseResult.rows.length === 0) {
        console.log('Dose not found');
      } else {
        const dose = doseResult.rows[0];
        console.log('\n=== Dose Details ===');
        console.log(JSON.stringify(dose, null, 2));
      }
      break;
    }

    case '4':
      console.log('Exiting...');
      break;

    default:
      console.log('Invalid action');
  }

  rl.close();
}

main().catch(error => {
  console.error('Error:', error);
  rl.close();
  process.exit(1);
});
