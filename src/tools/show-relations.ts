/**
 * Show Relations Tool
 * 
 * Returns all foreign key relationships for a table, including
 * tables that reference this table and tables this table references.
 * 
 * @module tools/show-relations
 * 
 * **Validates: Requirements 6.1, 6.2, 6.3**
 */

import { ConnectionManager, DatabaseType } from '../connection-manager.js';
import { RelationInfo } from '../types.js';

/**
 * Input parameters for show_relations tool
 */
export interface ShowRelationsInput {
  table: string;
  database?: 'crm' | 'operation';
}

/**
 * Output from show_relations tool
 */
export interface ShowRelationsOutput {
  table: string;
  referencedBy: RelationInfo[];
  references: RelationInfo[];
  message?: string;
}

/**
 * Default database when not specified
 */
const DEFAULT_DATABASE: DatabaseType = 'crm';

/**
 * Shows all foreign key relationships for a table
 * 
 * Uses INFORMATION_SCHEMA.KEY_COLUMN_USAGE to find:
 * - Tables that reference this table (referencedBy)
 * - Tables this table references (references)
 * 
 * @param connectionManager - Connection manager instance
 * @param input - Input parameters with table name and optional database
 * @returns Relationship information with referencedBy and references arrays
 * 
 * **Validates: Requirements 6.1, 6.2, 6.3**
 */
export async function showRelations(
  connectionManager: ConnectionManager,
  input: ShowRelationsInput
): Promise<ShowRelationsOutput> {
  const database = input.database || DEFAULT_DATABASE;
  const tableName = input.table;

  // Get tables that this table references (outgoing foreign keys)
  const references = await getOutgoingRelations(connectionManager, database, tableName);

  // Get tables that reference this table (incoming foreign keys)
  const referencedBy = await getIncomingRelations(connectionManager, database, tableName);

  // Build result with optional message for empty relations
  const result: ShowRelationsOutput = {
    table: tableName,
    referencedBy,
    references
  };

  if (referencedBy.length === 0 && references.length === 0) {
    result.message = `No relationships found for table '${tableName}'`;
  }

  return result;
}

/**
 * Gets tables that this table references (outgoing foreign keys)
 * 
 * **Validates: Requirements 6.1**
 */
async function getOutgoingRelations(
  connectionManager: ConnectionManager,
  database: DatabaseType,
  tableName: string
): Promise<RelationInfo[]> {
  const query = `
    SELECT 
      kcu.CONSTRAINT_NAME as constraint_name,
      kcu.COLUMN_NAME as column_name,
      kcu.REFERENCED_TABLE_NAME as referenced_table,
      kcu.REFERENCED_COLUMN_NAME as referenced_column
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
    WHERE kcu.TABLE_SCHEMA = DATABASE()
      AND kcu.TABLE_NAME = ?
      AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
  `;

  const result = await connectionManager.executeQuery(database, query, [tableName]);

  const relations: RelationInfo[] = [];

  for (const row of result.rows) {
    const referencedTable = String(row.referenced_table || '');
    const columnName = String(row.column_name || '');
    const constraintName = String(row.constraint_name || '');

    // Determine relationship type
    const relationType = await determineRelationType(
      connectionManager,
      database,
      tableName,
      columnName
    );

    relations.push({
      table: referencedTable,
      column: columnName,
      foreignKey: constraintName,
      relationType
    });
  }

  return relations;
}

/**
 * Gets tables that reference this table (incoming foreign keys)
 * 
 * **Validates: Requirements 6.1**
 */
async function getIncomingRelations(
  connectionManager: ConnectionManager,
  database: DatabaseType,
  tableName: string
): Promise<RelationInfo[]> {
  const query = `
    SELECT 
      kcu.CONSTRAINT_NAME as constraint_name,
      kcu.TABLE_NAME as source_table,
      kcu.COLUMN_NAME as source_column,
      kcu.REFERENCED_COLUMN_NAME as referenced_column
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
    WHERE kcu.TABLE_SCHEMA = DATABASE()
      AND kcu.REFERENCED_TABLE_NAME = ?
  `;

  const result = await connectionManager.executeQuery(database, query, [tableName]);

  const relations: RelationInfo[] = [];

  for (const row of result.rows) {
    const sourceTable = String(row.source_table || '');
    const sourceColumn = String(row.source_column || '');
    const constraintName = String(row.constraint_name || '');

    // Determine relationship type from the referencing table's perspective
    const relationType = await determineRelationType(
      connectionManager,
      database,
      sourceTable,
      sourceColumn
    );

    relations.push({
      table: sourceTable,
      column: sourceColumn,
      foreignKey: constraintName,
      relationType
    });
  }

  return relations;
}

/**
 * Determines the relationship type (one-to-one or one-to-many)
 * 
 * A relationship is one-to-one if the foreign key column has a unique constraint.
 * Otherwise, it's one-to-many.
 * 
 * **Validates: Requirements 6.2**
 */
async function determineRelationType(
  connectionManager: ConnectionManager,
  database: DatabaseType,
  tableName: string,
  columnName: string
): Promise<'one-to-one' | 'one-to-many'> {
  // Check if the column has a unique index
  const query = `
    SELECT COUNT(*) as unique_count
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
      AND NON_UNIQUE = 0
  `;

  try {
    const result = await connectionManager.executeQuery(database, query, [tableName, columnName]);
    
    if (result.rows.length > 0) {
      const uniqueCount = Number(result.rows[0].unique_count || 0);
      return uniqueCount > 0 ? 'one-to-one' : 'one-to-many';
    }
  } catch {
    // If query fails, default to one-to-many
  }

  return 'one-to-many';
}

/**
 * Validates that a ShowRelationsOutput has all required fields
 * Used for property testing
 * 
 * **Validates: Requirements 6.1, 6.2**
 */
export function isValidShowRelationsOutput(output: unknown): output is ShowRelationsOutput {
  if (typeof output !== 'object' || output === null) {
    return false;
  }

  const o = output as Record<string, unknown>;

  // Check table name
  if (typeof o.table !== 'string') {
    return false;
  }

  // Check referencedBy array
  if (!Array.isArray(o.referencedBy)) {
    return false;
  }

  // Validate each referencedBy entry
  for (const rel of o.referencedBy) {
    if (!isValidRelationInfo(rel)) {
      return false;
    }
  }

  // Check references array
  if (!Array.isArray(o.references)) {
    return false;
  }

  // Validate each references entry
  for (const rel of o.references) {
    if (!isValidRelationInfo(rel)) {
      return false;
    }
  }

  // Optional message field
  if (o.message !== undefined && typeof o.message !== 'string') {
    return false;
  }

  return true;
}

/**
 * Validates RelationInfo structure
 * Ensures relationType is present and valid
 * 
 * **Validates: Requirements 6.2**
 */
export function isValidRelationInfo(rel: unknown): rel is RelationInfo {
  if (typeof rel !== 'object' || rel === null) {
    return false;
  }

  const r = rel as Record<string, unknown>;

  // Check required fields
  if (typeof r.table !== 'string') {
    return false;
  }

  if (typeof r.column !== 'string') {
    return false;
  }

  if (typeof r.foreignKey !== 'string') {
    return false;
  }

  // Check relationType is present and valid
  if (r.relationType !== 'one-to-one' && r.relationType !== 'one-to-many') {
    return false;
  }

  return true;
}
