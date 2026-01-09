/**
 * Run Query Tool
 * 
 * Executes custom SELECT queries with validation, row limit enforcement,
 * and execution time tracking.
 * 
 * @module tools/run-query
 * 
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
 */

import { ConnectionManager, DatabaseType } from '../connection-manager.js';
import { validate } from '../query-validator.js';
import { LIMITS } from '../types.js';

/**
 * Input parameters for run_query tool
 */
export interface RunQueryInput {
  query: string;
  database?: 'crm' | 'operation';
  limit?: number;
}

/**
 * Output from run_query tool
 */
export interface RunQueryOutput {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  executionTime: number;
}

/**
 * Default database when not specified
 */
const DEFAULT_DATABASE: DatabaseType = 'crm';

/**
 * Validates and enforces row limit for custom queries
 * 
 * **Validates: Requirements 5.3**
 * 
 * @param requestedLimit - User requested limit
 * @returns Enforced limit within allowed bounds
 */
export function enforceQueryLimit(requestedLimit?: number): number {
  if (requestedLimit === undefined || requestedLimit === null) {
    return LIMITS.QUERY_DEFAULT;
  }
  
  if (requestedLimit < 1) {
    return LIMITS.QUERY_DEFAULT;
  }
  
  if (requestedLimit > LIMITS.QUERY_MAX) {
    return LIMITS.QUERY_MAX;
  }
  
  return requestedLimit;
}

/**
 * Executes a custom SELECT query with validation and limits
 * 
 * @param connectionManager - Connection manager instance
 * @param input - Input parameters with query, database, and limit
 * @returns Query result with columns, rows, and execution metadata
 * @throws Error if query validation fails
 * 
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
 */
export async function runQuery(
  connectionManager: ConnectionManager,
  input: RunQueryInput
): Promise<RunQueryOutput> {
  const database = input.database || DEFAULT_DATABASE;
  const query = input.query;
  const limit = enforceQueryLimit(input.limit);
  
  // Validate query before execution
  const validation = validate(query);
  
  if (!validation.valid) {
    throw new Error(validation.error || 'Query validation failed');
  }
  
  // Track execution time
  const startTime = Date.now();
  
  try {
    // Execute query with limit enforcement
    const result = await connectionManager.executeQuery(database, query, [], limit);
    
    const executionTime = Date.now() - startTime;
    
    // Extract column names from fields
    const columns = result.fields.map(field => field.name);
    
    return {
      columns,
      rows: result.rows,
      rowCount: result.rowCount,
      truncated: result.truncated,
      executionTime
    };
  } catch (error) {
    const errorMessage = (error as Error).message;
    throw new Error(`Query execution failed: ${errorMessage}`);
  }
}

/**
 * Validates that a RunQueryOutput has all required fields
 * Used for property testing
 */
export function isValidRunQueryOutput(output: unknown): output is RunQueryOutput {
  if (typeof output !== 'object' || output === null) {
    return false;
  }
  
  const o = output as Record<string, unknown>;
  
  return (
    Array.isArray(o.columns) &&
    o.columns.every((c: unknown) => typeof c === 'string') &&
    Array.isArray(o.rows) &&
    typeof o.rowCount === 'number' &&
    typeof o.truncated === 'boolean' &&
    typeof o.executionTime === 'number'
  );
}

/**
 * Validates truncation flag consistency
 * If actual row count exceeds limit, truncated should be true
 * 
 * Used for property testing
 * 
 * **Validates: Requirements 5.5**
 */
export function isTruncationFlagConsistent(
  actualRowCount: number,
  limit: number,
  truncated: boolean
): boolean {
  // If we got more rows than the limit, truncated must be true
  // Note: The connection manager requests limit+1 rows to detect truncation
  // So if actualRowCount equals limit and there were more rows, truncated is true
  if (truncated) {
    // If truncated is true, there should have been more rows available
    return true;
  }
  
  // If truncated is false, actualRowCount should be less than or equal to limit
  return actualRowCount <= limit;
}
