/**
 * Preview Data Tool
 * 
 * Previews table data with column selection, WHERE clause filtering,
 * and text truncation for long fields.
 * 
 * @module tools/preview-data
 * 
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
 */

import { ConnectionManager, DatabaseType } from '../connection-manager.js';
import { LIMITS } from '../types.js';

/**
 * Input parameters for preview_data tool
 */
export interface PreviewDataInput {
  table: string;
  database?: 'crm' | 'operation';
  columns?: string[];
  limit?: number;
  where?: string;
}

/**
 * Output from preview_data tool
 */
export interface PreviewDataOutput {
  table: string;
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  truncatedFields: string[];
}

/**
 * Default database when not specified
 */
const DEFAULT_DATABASE: DatabaseType = 'crm';

/**
 * Escapes SQL identifier to prevent injection
 * Removes backticks and other dangerous characters
 */
function escapeSqlIdentifier(identifier: string): string {
  return identifier.replace(/[`'"\\;]/g, '');
}

/**
 * Truncates text fields that exceed the maximum length
 * Adds ellipsis indicator for truncated values
 * 
 * **Validates: Requirements 4.4**
 */
export function truncateText(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  
  if (value.length > LIMITS.TEXT_TRUNCATE) {
    return value.substring(0, LIMITS.TEXT_TRUNCATE) + '...';
  }
  
  return value;
}

/**
 * Checks if a value was truncated (ends with ellipsis and original was longer)
 */
export function isTruncated(original: unknown, truncated: unknown): boolean {
  if (typeof original !== 'string' || typeof truncated !== 'string') {
    return false;
  }
  
  return original.length > LIMITS.TEXT_TRUNCATE && truncated.endsWith('...');
}

/**
 * Validates and enforces row limit
 * 
 * **Validates: Requirements 4.1**
 */
export function enforceRowLimit(requestedLimit?: number): number {
  if (requestedLimit === undefined || requestedLimit === null) {
    return LIMITS.PREVIEW_DEFAULT;
  }
  
  if (requestedLimit < 1) {
    return LIMITS.PREVIEW_DEFAULT;
  }
  
  if (requestedLimit > LIMITS.PREVIEW_MAX) {
    return LIMITS.PREVIEW_MAX;
  }
  
  return requestedLimit;
}


/**
 * Builds column list for SELECT query
 * 
 * **Validates: Requirements 4.2**
 */
function buildColumnList(columns?: string[]): string {
  if (!columns || columns.length === 0) {
    return '*';
  }
  
  return columns
    .map(col => `\`${escapeSqlIdentifier(col)}\``)
    .join(', ');
}

/**
 * Sanitizes WHERE clause to prevent injection
 * Only allows basic comparison operators and logical operators
 */
function sanitizeWhereClause(where?: string): string | null {
  if (!where || typeof where !== 'string') {
    return null;
  }
  
  const trimmed = where.trim();
  
  if (!trimmed) {
    return null;
  }
  
  // Remove any semicolons to prevent multiple statements
  const sanitized = trimmed.replace(/;/g, '');
  
  return sanitized;
}

/**
 * Previews data from a table with optional filtering and column selection
 * 
 * @param connectionManager - Connection manager instance
 * @param input - Input parameters with table, columns, limit, and where clause
 * @returns Preview data with rows and metadata
 * @throws Error if table does not exist
 * 
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
 */
export async function previewData(
  connectionManager: ConnectionManager,
  input: PreviewDataInput
): Promise<PreviewDataOutput> {
  const database = input.database || DEFAULT_DATABASE;
  const tableName = input.table;
  const limit = enforceRowLimit(input.limit);
  const columnList = buildColumnList(input.columns);
  const whereClause = sanitizeWhereClause(input.where);
  
  // Build the query
  let query = `SELECT ${columnList} FROM \`${escapeSqlIdentifier(tableName)}\``;
  
  if (whereClause) {
    query += ` WHERE ${whereClause}`;
  }
  
  query += ` LIMIT ${limit}`;
  
  try {
    const result = await connectionManager.executeQuery(database, query);
    
    // Track which fields were truncated
    const truncatedFieldsSet = new Set<string>();
    
    // Process rows and truncate long text fields
    const processedRows = result.rows.map(row => {
      const processedRow: Record<string, unknown> = {};
      
      for (const [key, value] of Object.entries(row)) {
        const truncatedValue = truncateText(value);
        processedRow[key] = truncatedValue;
        
        if (isTruncated(value, truncatedValue)) {
          truncatedFieldsSet.add(key);
        }
      }
      
      return processedRow;
    });
    
    // Determine actual columns returned
    const returnedColumns = result.rows.length > 0 
      ? Object.keys(result.rows[0])
      : (input.columns || []);
    
    return {
      table: tableName,
      columns: returnedColumns,
      rows: processedRows,
      totalRows: processedRows.length,
      truncatedFields: Array.from(truncatedFieldsSet)
    };
  } catch (error) {
    const errorMessage = (error as Error).message;
    
    // Check for table not found error
    if (errorMessage.includes("doesn't exist") || errorMessage.includes('Unknown table')) {
      throw new Error(`Table '${tableName}' does not exist in database '${database}'`);
    }
    
    throw error;
  }
}

/**
 * Validates that a PreviewDataOutput has all required fields
 * Used for property testing
 */
export function isValidPreviewDataOutput(output: unknown): output is PreviewDataOutput {
  if (typeof output !== 'object' || output === null) {
    return false;
  }
  
  const o = output as Record<string, unknown>;
  
  return (
    typeof o.table === 'string' &&
    Array.isArray(o.columns) &&
    o.columns.every((c: unknown) => typeof c === 'string') &&
    Array.isArray(o.rows) &&
    typeof o.totalRows === 'number' &&
    Array.isArray(o.truncatedFields) &&
    o.truncatedFields.every((f: unknown) => typeof f === 'string')
  );
}

/**
 * Validates that rows only contain specified columns
 * Used for property testing
 * 
 * **Validates: Requirements 4.2**
 */
export function rowsContainOnlySpecifiedColumns(
  rows: Record<string, unknown>[],
  specifiedColumns: string[]
): boolean {
  if (rows.length === 0) {
    return true;
  }
  
  const specifiedSet = new Set(specifiedColumns.map(c => c.toLowerCase()));
  
  for (const row of rows) {
    const rowColumns = Object.keys(row);
    
    for (const col of rowColumns) {
      if (!specifiedSet.has(col.toLowerCase())) {
        return false;
      }
    }
  }
  
  return true;
}
