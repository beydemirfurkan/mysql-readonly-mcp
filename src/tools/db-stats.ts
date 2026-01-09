/**
 * Database Stats Tool
 * 
 * Returns database statistics including table count, total rows,
 * database size, and top 10 largest tables by rows and size.
 * 
 * @module tools/db-stats
 * 
 * **Validates: Requirements 7.1, 7.2, 7.3**
 */

import { ConnectionManager, DatabaseType } from '../connection-manager.js';
import { TableStat } from '../types.js';

/**
 * Input parameters for db_stats tool
 */
export interface DbStatsInput {
  database?: 'crm' | 'operation';
}

/**
 * Output from db_stats tool
 */
export interface DbStatsOutput {
  database: string;
  tableCount: number;
  totalRows: number;
  totalSize: string;
  largestByRows: TableStat[];
  largestBySize: TableStat[];
}

/**
 * Default database when not specified
 */
const DEFAULT_DATABASE: DatabaseType = 'crm';

/**
 * Maximum number of tables to return in top lists
 * 
 * **Validates: Requirements 7.2, 7.3**
 */
const TOP_TABLES_LIMIT = 10;

/**
 * Gets database statistics
 * 
 * Uses INFORMATION_SCHEMA.TABLES to calculate:
 * - Total table count
 * - Total row count estimate
 * - Total database size
 * - Top 10 largest tables by row count
 * - Top 10 largest tables by data size
 * 
 * @param connectionManager - Connection manager instance
 * @param input - Input parameters with optional database selection
 * @returns Database statistics
 * 
 * **Validates: Requirements 7.1, 7.2, 7.3**
 */
export async function dbStats(
  connectionManager: ConnectionManager,
  input: DbStatsInput
): Promise<DbStatsOutput> {
  const database = input.database || DEFAULT_DATABASE;

  // Get overall database statistics
  const overallStats = await getOverallStats(connectionManager, database);

  // Get top 10 largest tables by row count
  const largestByRows = await getLargestTablesByRows(connectionManager, database);

  // Get top 10 largest tables by size
  const largestBySize = await getLargestTablesBySize(connectionManager, database);

  return {
    database,
    tableCount: overallStats.tableCount,
    totalRows: overallStats.totalRows,
    totalSize: overallStats.totalSize,
    largestByRows,
    largestBySize
  };
}

/**
 * Gets overall database statistics (table count, total rows, total size)
 * 
 * **Validates: Requirements 7.1**
 */
async function getOverallStats(
  connectionManager: ConnectionManager,
  database: DatabaseType
): Promise<{ tableCount: number; totalRows: number; totalSize: string }> {
  const query = `
    SELECT 
      COUNT(*) as table_count,
      COALESCE(SUM(TABLE_ROWS), 0) as total_rows,
      COALESCE(SUM(DATA_LENGTH + INDEX_LENGTH), 0) as total_bytes
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_TYPE = 'BASE TABLE'
  `;

  const result = await connectionManager.executeQuery(database, query);

  if (result.rows.length === 0) {
    return { tableCount: 0, totalRows: 0, totalSize: '0 B' };
  }

  const row = result.rows[0];
  const tableCount = Number(row.table_count) || 0;
  const totalRows = Number(row.total_rows) || 0;
  const totalBytes = Number(row.total_bytes) || 0;

  return {
    tableCount,
    totalRows,
    totalSize: formatBytes(totalBytes)
  };
}

/**
 * Gets top 10 largest tables by row count
 * 
 * **Validates: Requirements 7.2**
 */
async function getLargestTablesByRows(
  connectionManager: ConnectionManager,
  database: DatabaseType
): Promise<TableStat[]> {
  const query = `
    SELECT 
      TABLE_NAME as table_name,
      COALESCE(TABLE_ROWS, 0) as row_count,
      COALESCE(DATA_LENGTH + INDEX_LENGTH, 0) as total_bytes
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_ROWS DESC
    LIMIT ${TOP_TABLES_LIMIT}
  `;

  const result = await connectionManager.executeQuery(database, query);

  return result.rows.map(row => ({
    table: String(row.table_name || ''),
    rows: Number(row.row_count) || 0,
    size: formatBytes(Number(row.total_bytes) || 0)
  }));
}

/**
 * Gets top 10 largest tables by data size
 * 
 * **Validates: Requirements 7.3**
 */
async function getLargestTablesBySize(
  connectionManager: ConnectionManager,
  database: DatabaseType
): Promise<TableStat[]> {
  const query = `
    SELECT 
      TABLE_NAME as table_name,
      COALESCE(TABLE_ROWS, 0) as row_count,
      COALESCE(DATA_LENGTH + INDEX_LENGTH, 0) as total_bytes
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_TYPE = 'BASE TABLE'
    ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC
    LIMIT ${TOP_TABLES_LIMIT}
  `;

  const result = await connectionManager.executeQuery(database, query);

  return result.rows.map(row => ({
    table: String(row.table_name || ''),
    rows: Number(row.row_count) || 0,
    size: formatBytes(Number(row.total_bytes) || 0)
  }));
}

/**
 * Formats bytes into human-readable string
 * 
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.5 GB", "256 MB")
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);

  // Use 2 decimal places for values >= 1, otherwise show more precision
  const formatted = value >= 10 
    ? value.toFixed(1) 
    : value.toFixed(2);

  return `${formatted} ${units[i]}`;
}

/**
 * Validates that a DbStatsOutput has all required fields
 * Used for property testing
 * 
 * **Validates: Requirements 7.1, 7.2, 7.3**
 */
export function isValidDbStatsOutput(output: unknown): output is DbStatsOutput {
  if (typeof output !== 'object' || output === null) {
    return false;
  }

  const o = output as Record<string, unknown>;

  // Check required fields
  if (typeof o.database !== 'string') {
    return false;
  }

  if (typeof o.tableCount !== 'number') {
    return false;
  }

  if (typeof o.totalRows !== 'number') {
    return false;
  }

  if (typeof o.totalSize !== 'string') {
    return false;
  }

  // Check largestByRows array
  if (!Array.isArray(o.largestByRows)) {
    return false;
  }

  // Validate largestByRows limit
  if (o.largestByRows.length > TOP_TABLES_LIMIT) {
    return false;
  }

  // Validate each entry in largestByRows
  for (const stat of o.largestByRows) {
    if (!isValidTableStat(stat)) {
      return false;
    }
  }

  // Check largestBySize array
  if (!Array.isArray(o.largestBySize)) {
    return false;
  }

  // Validate largestBySize limit
  if (o.largestBySize.length > TOP_TABLES_LIMIT) {
    return false;
  }

  // Validate each entry in largestBySize
  for (const stat of o.largestBySize) {
    if (!isValidTableStat(stat)) {
      return false;
    }
  }

  return true;
}

/**
 * Validates TableStat structure
 */
export function isValidTableStat(stat: unknown): stat is TableStat {
  if (typeof stat !== 'object' || stat === null) {
    return false;
  }

  const s = stat as Record<string, unknown>;

  return (
    typeof s.table === 'string' &&
    typeof s.rows === 'number' &&
    typeof s.size === 'string'
  );
}

/**
 * Validates that largestByRows is sorted in descending order by rows
 * Used for property testing
 * 
 * **Validates: Requirements 7.2**
 */
export function isDescendingByRows(stats: TableStat[]): boolean {
  for (let i = 1; i < stats.length; i++) {
    if (stats[i].rows > stats[i - 1].rows) {
      return false;
    }
  }
  return true;
}

/**
 * Parses size string back to bytes for comparison
 * Used for property testing
 */
export function parseSizeToBytes(size: string): number {
  const match = size.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)$/);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    'B': 1,
    'KB': 1024,
    'MB': 1024 * 1024,
    'GB': 1024 * 1024 * 1024,
    'TB': 1024 * 1024 * 1024 * 1024
  };

  return value * (multipliers[unit] || 1);
}

/**
 * Validates that largestBySize is sorted in descending order by size
 * Used for property testing
 * 
 * **Validates: Requirements 7.3**
 */
export function isDescendingBySize(stats: TableStat[]): boolean {
  for (let i = 1; i < stats.length; i++) {
    const currentBytes = parseSizeToBytes(stats[i].size);
    const prevBytes = parseSizeToBytes(stats[i - 1].size);
    if (currentBytes > prevBytes) {
      return false;
    }
  }
  return true;
}

/**
 * Exported constant for testing
 */
export const MAX_TOP_TABLES = TOP_TABLES_LIMIT;
