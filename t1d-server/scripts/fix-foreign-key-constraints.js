import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function fixForeignKeyConstraints() {
  const client = await pool.connect();

  try {
    console.log('Fixing foreign key constraints to allow deletions...\n');

    // Start transaction
    await client.query('BEGIN');

    // 1. Drop existing constraint on insulin_doses.related_meal_id
    console.log('Dropping existing constraint: insulin_doses_related_meal_id_fkey');
    await client.query(`
      ALTER TABLE insulin_doses
      DROP CONSTRAINT IF EXISTS insulin_doses_related_meal_id_fkey
    `);

    // 2. Re-add constraint with ON DELETE SET NULL
    console.log('Adding new constraint with ON DELETE SET NULL');
    await client.query(`
      ALTER TABLE insulin_doses
      ADD CONSTRAINT insulin_doses_related_meal_id_fkey
      FOREIGN KEY (related_meal_id)
      REFERENCES meals(id)
      ON DELETE SET NULL
    `);

    // 3. Check for other potential constraints that might need fixing
    // Exercise logs might also have related meals
    const exerciseConstraintCheck = await client.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'exercise_logs'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%meal%'
    `);

    if (exerciseConstraintCheck.rows.length > 0) {
      console.log('\nFound exercise_logs meal constraint, fixing...');
      for (const row of exerciseConstraintCheck.rows) {
        await client.query(`
          ALTER TABLE exercise_logs
          DROP CONSTRAINT IF EXISTS ${row.constraint_name}
        `);
        // Re-add with SET NULL if it was a meal reference
        if (row.constraint_name.includes('meal')) {
          await client.query(`
            ALTER TABLE exercise_logs
            ADD CONSTRAINT ${row.constraint_name}
            FOREIGN KEY (related_meal_id)
            REFERENCES meals(id)
            ON DELETE SET NULL
          `);
        }
      }
    }

    // Commit transaction
    await client.query('COMMIT');

    console.log('\n✓ Successfully updated foreign key constraints!');
    console.log('✓ You can now delete meals even if they have related insulin doses');
    console.log('✓ Related insulin doses will have their related_meal_id set to NULL when a meal is deleted');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error fixing constraints:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixForeignKeyConstraints()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
