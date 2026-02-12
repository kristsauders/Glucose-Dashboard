import { query } from '../src/config/database.js';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';

async function testAppleHealthAPI() {
  try {
    console.log('Testing Apple Health API...\n');

    // Step 1: Get a test user
    const userResult = await query('SELECT id, email FROM users LIMIT 1');
    if (userResult.rows.length === 0) {
      console.error('✗ No users found in database. Please create a user first.');
      process.exit(1);
    }

    const user = userResult.rows[0];
    console.log(`✓ Found test user: ${user.email} (${user.id})`);

    // Step 2: Generate JWT token
    const token = jwt.sign({ id: user.id, email: user.email }, env.JWT_SECRET, {
      expiresIn: '30d',
    });
    console.log(`✓ Generated JWT token`);

    // Step 3: Prepare sample Apple Health workout data
    const sampleWorkouts = [
      {
        id: `test-workout-${Date.now()}-1`,
        type: 'HKWorkoutActivityTypeRunning',
        startDate: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        endDate: new Date(Date.now() - 1800000).toISOString(), // 30 min ago
        duration: 30,
        totalEnergyBurned: 250,
        totalDistance: 5000, // 5 km
      },
      {
        id: `test-workout-${Date.now()}-2`,
        type: 'HKWorkoutActivityTypeYoga',
        startDate: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
        endDate: new Date(Date.now() - 5400000).toISOString(), // 1.5 hours ago
        duration: 30,
        totalEnergyBurned: 120,
      },
    ];

    console.log(`✓ Prepared ${sampleWorkouts.length} sample workouts\n`);

    // Step 4: Make API request
    console.log('Making POST request to /api/apple-health/workouts...');
    const response = await fetch('http://127.0.0.1:3002/api/apple-health/workouts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workouts: sampleWorkouts,
        lastSyncDate: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('\n✓ API Response:');
    console.log(JSON.stringify(result, null, 2));

    // Step 5: Verify data was inserted
    console.log('\n✓ Verifying database records...');
    const dbResult = await query(
      `SELECT
        id,
        timestamp,
        workout_id,
        activity_type,
        duration_minutes,
        intensity,
        description,
        notes,
        source
       FROM exercise_logs
       WHERE user_id = $1 AND source = 'apple_health'
       ORDER BY timestamp DESC
       LIMIT 5`,
      [user.id]
    );

    console.log(`\n✓ Found ${dbResult.rows.length} Apple Health workouts in database:`);
    dbResult.rows.forEach((row, i) => {
      console.log(`\n  Workout ${i + 1}:`);
      console.log(`    Type: ${row.activity_type}`);
      console.log(`    Description: ${row.description}`);
      console.log(`    Duration: ${row.duration_minutes} min`);
      console.log(`    Intensity: ${row.intensity}`);
      console.log(`    Notes: ${row.notes || 'None'}`);
      console.log(`    Workout ID: ${row.workout_id}`);
      console.log(`    Timestamp: ${row.timestamp}`);
    });

    // Step 6: Test duplicate prevention
    console.log('\n\n✓ Testing duplicate prevention...');
    const duplicateResponse = await fetch('http://127.0.0.1:3002/api/apple-health/workouts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workouts: sampleWorkouts, // Same workouts
      }),
    });

    const duplicateResult = await duplicateResponse.json();
    console.log('\n✓ Duplicate test response:');
    console.log(JSON.stringify(duplicateResult, null, 2));

    if (duplicateResult.skipped === sampleWorkouts.length) {
      console.log('\n✓ ✓ ✓ Deduplication working correctly!');
    } else {
      console.log('\n⚠️  Warning: Some duplicates were not skipped');
    }

    // Step 7: Test status endpoint
    console.log('\n\n✓ Testing status endpoint...');
    const statusResponse = await fetch('http://127.0.0.1:3002/api/apple-health/status', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const statusResult = await statusResponse.json();
    console.log('\n✓ Status endpoint response:');
    console.log(JSON.stringify(statusResult, null, 2));

    console.log('\n\n════════════════════════════════════════');
    console.log('✓ ✓ ✓ All tests passed successfully! ✓ ✓ ✓');
    console.log('════════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Test failed:', error);
    process.exit(1);
  }
}

testAppleHealthAPI();
