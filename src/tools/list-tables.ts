/**
 * List Tables Tool
 * 
 * Lists all tables in a database with their type, row count, and engine information.
 * 
 * @module tools/list-tables
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3**
 */

import { ConnectionManager, DatabaseType } from '../connection-manager.js';
import { TableInfo } from '../types.js';

/**
 * Input parameters for list_tables tool
 */
export interface ListTablesInput {
  database?: 'crm' | 'operation';
}

/**
 * Output from list_tables tool
 */
export interface ListTablesOutput {
  tables: TableInfo[];
  database: string;
}

/**
 * Default database when not specified
 * 
 * **Validates: Requirements 2.3**
 */
const DEFAULT_DATABASE: DatabaseType = 'crm';

/**
 * Lists all tables in the specified database
 * 
 * Uses SHOW TABLE STATUS to get comprehensive table information including:
 * - Table name
 * - Table type (BASE TABLE or VIEW)
 * - Row count estimate
 * - Storage engine
 * 
 * @param connectionManager - Connection manager instance
 * @param input - Input parameters with optional database selection
 * @returns List of tables with metadata
 * 
 * **Validates: Requirements 2.1, 2.2**
 */
export async function listTables(
  connectionManager: ConnectionManager,
  input: ListTablesInput
): Promise<ListTablesOutput> {
  const database = input.database || DEFAULT_DATABASE;
  
  // Use SHOW TABLE STATUS to get table information
  const query = 'SHOW TABLE STATUS';
  
  const result = await connectionManager.executeQuery(database, query);
  
  const tables: TableInfo[] = result.rows.map(row => ({
    name: String(row.Name || ''),
    type: determineTableType(row),
    rowCount: Number(row.Rows) || 0,
    engine: String(row.Engine || 'N/A')
  }));
  
  return {
    tables,
    database
  };
}

/**
 * Determines if a table is a BASE TABLE or VIEW
 * 
 * Views have NULL engine in SHOW TABLE STATUS
 */
function determineTableType(row: Record<string, unknown>): 'BASE TABLE' | 'VIEW' {
  // Views have NULL engine
  if (row.Engine === null || row.Engine === undefined) {
    return 'VIEW';
  }
  return 'BASE TABLE';
}

/**
 * Validates that a TableInfo object has all required fields
 * Used for property testing
 * 
 * **Validates: Requirements 2.2**
 */
export function isValidTableInfo(table: unknown): table is TableInfo {
  if (typeof table !== 'object' || table === null) {
    return false;
  }
  
  const t = table as Record<string, unknown>;
  
  return (
    typeof t.name === 'string' &&
    (t.type === 'BASE TABLE' || t.type === 'VIEW') &&
    typeof t.rowCount === 'number'
  );
}

/**
 * Validates that a ListTablesOutput has all required fields
 * Used for property testing
 */
export function isValidListTablesOutput(output: unknown): output is ListTablesOutput {
  if (typeof output !== 'object' || output === null) {
    return false;
  }
  
  const o = output as Record<string, unknown>;
  
  if (typeof o.database !== 'string') {
    return false;
  }
  
  if (!Array.isArray(o.tables)) {
    return false;
  }
  
  return o.tables.every(isValidTableInfo);
}
