/**
 * Safe SQL Executor
 *
 * Provides secure, read-only SQL query execution for the Sage agent.
 * Implements multiple layers of security to prevent SQL injection,
 * data leakage, and resource abuse.
 *
 * Security Layers:
 * 1. Query Type Validation - Only SELECT queries allowed
 * 2. Keyword Blacklist - Dangerous keywords blocked
 * 3. Auto-injected User Filters - Data isolation via CTEs
 * 4. Row Limits - Maximum 1000 rows returned
 * 5. Audit Logging - All queries tracked
 */

import { query } from '../config/database.js';

/**
 * Execute a read-only SQL query with strict security controls
 *
 * @param userId - User ID to filter data
 * @param sqlQuery - The SQL SELECT query to execute
 * @param description - Human-readable description of the query's purpose
 * @returns JSON string with query results
 * @throws Error if query is invalid or execution fails
 */
export async function executeSafeReadOnlyQuery(
  userId: string,
  sqlQuery: string,
  description: string
): Promise<string> {

  // Layer 1: Query Type Validation
  // Only SELECT queries are allowed - no modifications permitted
  const normalizedQuery = sqlQuery.trim().toLowerCase();
  if (!normalizedQuery.startsWith('select')) {
    throw new Error('Only SELECT queries are allowed');
  }

  // Layer 2: Keyword Blacklist
  // Prevent SQL injection and unauthorized operations
  const dangerousKeywords = [
    'insert', 'update', 'delete', 'drop', 'create', 'alter',
    'truncate', 'grant', 'revoke', 'exec', 'execute',
    'pg_sleep', 'pg_read_file', 'pg_write_file', 'copy',
    'into outfile', 'into dumpfile', 'load_file'
  ];

  for (const keyword of dangerousKeywords) {
    if (normalizedQuery.includes(keyword)) {
      throw new Error(`Forbidden keyword detected: ${keyword}`);
    }
  }

  // Layer 3: Auto-inject user_id filter via CTEs
  // This wraps the user's query with Common Table Expressions (CTEs)
  // that pre-filter all tables to only the current user's data.
  // The user writes queries against user_* tables, which are automatically
  // scoped to their data only.
  const safeQuery = `
    WITH user_glucose_readings AS (
      SELECT * FROM glucose_readings WHERE user_id = $1
    ),
    user_meals AS (
      SELECT * FROM meals WHERE user_id = $1
    ),
    user_insulin_doses AS (
      SELECT * FROM insulin_doses WHERE user_id = $1
    ),
    user_exercise_logs AS (
      SELECT * FROM exercise_logs WHERE user_id = $1
    ),
    user_glucose_patterns AS (
      SELECT * FROM glucose_patterns WHERE user_id = $1
    ),
    user_glucose_correlations AS (
      SELECT * FROM glucose_correlations WHERE user_id = $1
    ),
    user_sage_messages AS (
      SELECT * FROM sage_messages WHERE user_id = $1
    )
    ${sqlQuery}
  `;

  // Layer 4: Execution with limits
  try {
    const result = await query(safeQuery, [userId]);

    // Enforce row limit to prevent resource abuse
    const maxRows = 1000;
    const limitedRows = result.rows.slice(0, maxRows);

    // Layer 5: Audit logging
    // Log all successful queries for monitoring and debugging
    await query(
      `INSERT INTO query_audit_log (user_id, query_description, query_text, row_count, executed_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, description, sqlQuery, limitedRows.length]
    );

    return JSON.stringify({
      success: true,
      rowCount: limitedRows.length,
      data: limitedRows,
      description,
      note: limitedRows.length === maxRows ? 'Results limited to 1000 rows' : undefined
    });

  } catch (error: any) {
    console.error('[SQL Query Tool] Error:', error);

    // Log errors for security monitoring and debugging
    try {
      await query(
        `INSERT INTO query_audit_log (user_id, query_description, query_text, error_message, executed_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [userId, description, sqlQuery, error.message]
      );
    } catch (logError) {
      // If logging fails, log to console but don't throw
      console.error('[SQL Query Tool] Failed to log error:', logError);
    }

    throw new Error(`Query failed: ${error.message}`);
  }
}
