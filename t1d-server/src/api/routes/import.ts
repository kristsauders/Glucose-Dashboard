import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { parseLibreCSV } from '../../services/csvParser.js';
import { query } from '../../config/database.js';
import type { AuthRequest } from '../../types/index.js';

const router = Router();

router.use(authMiddleware);

// Helper function to batch insert records
async function batchInsert<T>(
  items: T[],
  batchSize: number,
  insertFn: (batch: T[]) => Promise<number>
): Promise<number> {
  let totalInserted = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const inserted = await insertFn(batch);
    totalInserted += inserted;
  }

  return totalInserted;
}

// CSV import endpoint
router.post('/csv', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { csvContent } = req.body;

    if (!csvContent || typeof csvContent !== 'string') {
      return res.status(400).json({ error: 'CSV content required' });
    }

    console.log(`Parsing CSV for user ${authReq.user!.id}...`);

    // Get user's timezone
    const userResult = await query('SELECT timezone FROM users WHERE id = $1', [authReq.user!.id]);
    const userTimezone = userResult.rows[0]?.timezone || 'America/New_York';

    // Parse CSV with user's timezone
    const parsed = parseLibreCSV(csvContent, userTimezone);
    console.log(`Parsed CSV: ${parsed.glucoseReadings.length} glucose readings, ${parsed.meals.length} meals, ${parsed.insulin.length} insulin doses`);

    let insertedGlucose = 0;
    let insertedMeals = 0;
    let insertedInsulin = 0;

    // Insert glucose readings in batches of 1000
    if (parsed.glucoseReadings.length > 0) {
      insertedGlucose = await batchInsert(
        parsed.glucoseReadings,
        1000,
        async (batch) => {
          const values = batch.map((r, i) =>
            `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
          ).join(', ');

          const params = batch.flatMap(r => [
            authReq.user!.id,
            r.timestamp,
            r.glucose,
            r.device,
            r.recordType,
            'csv',
          ]);

          const result = await query(
            `INSERT INTO glucose_readings (user_id, timestamp, glucose, device, record_type, source)
             VALUES ${values}
             ON CONFLICT (user_id, timestamp, source) DO NOTHING
             RETURNING id`,
            params
          );

          return result.rowCount || 0;
        }
      );
    }

    // Insert meals in batches of 1000
    if (parsed.meals.length > 0) {
      insertedMeals = await batchInsert(
        parsed.meals,
        1000,
        async (batch) => {
          const values = batch.map((m, i) =>
            `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`
          ).join(', ');

          const params = batch.flatMap(m => [
            authReq.user!.id,
            m.timestamp,
            m.description || null,
            m.carbs,
            'csv',
          ]);

          const result = await query(
            `INSERT INTO meals (user_id, timestamp, description, carbs, source)
             VALUES ${values}
             RETURNING id`,
            params
          );

          return result.rowCount || 0;
        }
      );
    }

    // Insert insulin doses in batches of 1000
    if (parsed.insulin.length > 0) {
      insertedInsulin = await batchInsert(
        parsed.insulin,
        1000,
        async (batch) => {
          const values = batch.map((ins, i) =>
            `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
          ).join(', ');

          const params = batch.flatMap(ins => [
            authReq.user!.id,
            ins.timestamp,
            ins.type,
            ins.units,
            ins.insulinType,
            'csv',
          ]);

          const result = await query(
            `INSERT INTO insulin_doses (user_id, timestamp, type, units, insulin_type, source)
             VALUES ${values}
             RETURNING id`,
            params
          );

          return result.rowCount || 0;
        }
      );
    }

    console.log(`✓ CSV import complete: ${insertedGlucose} glucose, ${insertedMeals} meals, ${insertedInsulin} insulin`);

    res.json({
      success: true,
      imported: {
        glucose: insertedGlucose,
        meals: insertedMeals,
        insulin: insertedInsulin,
      },
      parsed: {
        glucose: parsed.glucoseReadings.length,
        meals: parsed.meals.length,
        insulin: parsed.insulin.length,
      },
    });
  } catch (error) {
    console.error('CSV import error:', error);
    next(error);
  }
});

export default router;
