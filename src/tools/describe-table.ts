/**
 * Describe Table Tool
 * 
 * Returns detailed schema information for a table including columns,
 * primary keys, foreign keys, and indexes.
 * 
 * @module tools/describe-table
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 */

import { ConnectionManager, DatabaseType } from '../connection-manager.js';
import { ColumnInfo, ForeignKeyInfo, IndexInfo } from '../types.js';

/**
 * Input parameters for describe_table tool
 */
export interface DescribeTableInput {
  table: string;
  database?: 'crm' | 'operation';
}

/**
 * Output from describe_table tool
 */
export interface DescribeTableOutput {
  table: string;
  columns: ColumnInfo[];
  primaryKey: string[];
  foreignKeys: ForeignKeyInfo[];
  indexes: IndexInfo[];
}

/**
 * Default database when not specified
 */
const DEFAULT_DATABASE: DatabaseType = 'crm';

/**
 * Describes a table's schema including columns, keys, and indexes
 * 
 * Uses multiple MySQL queries:
 * - DESCRIBE for column information
 * - SHOW INDEX for index information
 * - INFORMATION_SCHEMA for foreign key information
 * 
 * @param connectionManager - Connection manager instance
 * @param input - Input parameters with table name and optional database
 * @returns Table schema with columns, primary key, foreign keys, and indexes
 * @throws Error if table does not exist
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 */
export async function describeTable(
  connectionManager: ConnectionManager,
  input: DescribeTableInput
): Promise<DescribeTableOutput> {
  const database = input.database || DEFAULT_DATABASE;
  const tableName = input.table;

  // Get column information using DESCRIBE
  const columns = await getColumnInfo(connectionManager, database, tableName);
  
  // If no columns returned, table doesn't exist
  if (columns.length === 0) {
    throw new Error(`Table '${tableName}' does not exist in database '${database}'`);
  }

  // Get index information
  const { indexes, primaryKey } = await getIndexInfo(connectionManager, database, tableName);

  // Get foreign key information
  const foreignKeys = await getForeignKeyInfo(connectionManager, database, tableName);

  return {
    table: tableName,
    columns,
    primaryKey,
    foreignKeys,
    indexes
  };
}


/**
 * Gets column information for a table using DESCRIBE query
 * 
 * **Validates: Requirements 3.1**
 */
async function getColumnInfo(
  connectionManager: ConnectionManager,
  database: DatabaseType,
  tableName: string
): Promise<ColumnInfo[]> {
  try {
    const query = `DESCRIBE \`${escapeSqlIdentifier(tableName)}\``;
    const result = await connectionManager.executeQuery(database, query);

    return result.rows.map(row => ({
      name: String(row.Field || ''),
      type: String(row.Type || ''),
      nullable: row.Null === 'YES',
      default: row.Default !== null ? String(row.Default) : null,
      extra: String(row.Extra || ''),
      comment: '' // DESCRIBE doesn't include comments, we'll get them separately if needed
    }));
  } catch (error) {
    // If DESCRIBE fails, table likely doesn't exist
    const errorMessage = (error as Error).message;
    if (errorMessage.includes("doesn't exist") || errorMessage.includes('Unknown table')) {
      return [];
    }
    throw error;
  }
}

/**
 * Gets index information for a table using SHOW INDEX query
 * 
 * **Validates: Requirements 3.2, 3.3**
 */
async function getIndexInfo(
  connectionManager: ConnectionManager,
  database: DatabaseType,
  tableName: string
): Promise<{ indexes: IndexInfo[]; primaryKey: string[] }> {
  const query = `SHOW INDEX FROM \`${escapeSqlIdentifier(tableName)}\``;
  const result = await connectionManager.executeQuery(database, query);

  // Group index columns by index name
  const indexMap = new Map<string, {
    columns: string[];
    unique: boolean;
    type: string;
  }>();

  const primaryKey: string[] = [];

  for (const row of result.rows) {
    const keyName = String(row.Key_name || '');
    const columnName = String(row.Column_name || '');
    const nonUnique = Number(row.Non_unique) === 1;
    const indexType = String(row.Index_type || 'BTREE');

    // Track primary key columns
    if (keyName === 'PRIMARY') {
      primaryKey.push(columnName);
    }

    // Build index map
    if (!indexMap.has(keyName)) {
      indexMap.set(keyName, {
        columns: [],
        unique: !nonUnique,
        type: indexType
      });
    }

    const indexEntry = indexMap.get(keyName)!;
    indexEntry.columns.push(columnName);
  }

  // Convert map to array
  const indexes: IndexInfo[] = Array.from(indexMap.entries()).map(([name, info]) => ({
    name,
    columns: info.columns,
    unique: info.unique,
    type: info.type
  }));

  return { indexes, primaryKey };
}


/**
 * Gets foreign key information for a table using INFORMATION_SCHEMA
 * 
 * **Validates: Requirements 3.2**
 */
async function getForeignKeyInfo(
  connectionManager: ConnectionManager,
  database: DatabaseType,
  tableName: string
): Promise<ForeignKeyInfo[]> {
  // Query INFORMATION_SCHEMA for foreign key constraints
  const query = `
    SELECT 
      CONSTRAINT_NAME as constraint_name,
      COLUMN_NAME as column_name,
      REFERENCED_TABLE_NAME as referenced_table,
      REFERENCED_COLUMN_NAME as referenced_column
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `;

  const result = await connectionManager.executeQuery(database, query, [tableName]);

  return result.rows.map(row => ({
    name: String(row.constraint_name || ''),
    column: String(row.column_name || ''),
    referencedTable: String(row.referenced_table || ''),
    referencedColumn: String(row.referenced_column || '')
  }));
}

/**
 * Escapes SQL identifier to prevent injection
 * Removes backticks and other dangerous characters
 */
function escapeSqlIdentifier(identifier: string): string {
  // Remove any backticks and other potentially dangerous characters
  return identifier.replace(/[`'"\\;]/g, '');
}

/**
 * Validates that a DescribeTableOutput has all required fields
 * Used for property testing
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3**
 */
export function isValidDescribeTableOutput(output: unknown): output is DescribeTableOutput {
  if (typeof output !== 'object' || output === null) {
    return false;
  }

  const o = output as Record<string, unknown>;

  // Check table name
  if (typeof o.table !== 'string') {
    return false;
  }

  // Check columns array
  if (!Array.isArray(o.columns)) {
    return false;
  }

  // Validate each column has required fields
  for (const col of o.columns) {
    if (!isValidColumnInfo(col)) {
      return false;
    }
  }

  // Check primaryKey array
  if (!Array.isArray(o.primaryKey)) {
    return false;
  }

  // Check foreignKeys array
  if (!Array.isArray(o.foreignKeys)) {
    return false;
  }

  // Validate each foreign key
  for (const fk of o.foreignKeys) {
    if (!isValidForeignKeyInfo(fk)) {
      return false;
    }
  }

  // Check indexes array
  if (!Array.isArray(o.indexes)) {
    return false;
  }

  // Validate each index
  for (const idx of o.indexes) {
    if (!isValidIndexInfo(idx)) {
      return false;
    }
  }

  return true;
}

/**
 * Validates ColumnInfo structure
 */
function isValidColumnInfo(col: unknown): col is ColumnInfo {
  if (typeof col !== 'object' || col === null) {
    return false;
  }

  const c = col as Record<string, unknown>;

  return (
    typeof c.name === 'string' &&
    typeof c.type === 'string' &&
    typeof c.nullable === 'boolean' &&
    (c.default === null || typeof c.default === 'string') &&
    typeof c.extra === 'string'
  );
}

/**
 * Validates ForeignKeyInfo structure
 */
function isValidForeignKeyInfo(fk: unknown): fk is ForeignKeyInfo {
  if (typeof fk !== 'object' || fk === null) {
    return false;
  }

  const f = fk as Record<string, unknown>;

  return (
    typeof f.name === 'string' &&
    typeof f.column === 'string' &&
    typeof f.referencedTable === 'string' &&
    typeof f.referencedColumn === 'string'
  );
}

/**
 * Validates IndexInfo structure
 */
function isValidIndexInfo(idx: unknown): idx is IndexInfo {
  if (typeof idx !== 'object' || idx === null) {
    return false;
  }

  const i = idx as Record<string, unknown>;

  return (
    typeof i.name === 'string' &&
    Array.isArray(i.columns) &&
    i.columns.every((c: unknown) => typeof c === 'string') &&
    typeof i.unique === 'boolean' &&
    typeof i.type === 'string'
  );
}
