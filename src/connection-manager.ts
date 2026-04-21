/**
 * Connection Manager Module
 * 
 * Manages MySQL database connections for a single configured database.
 * Provides connection pooling and query execution with timeout handling.
 * 
 * @module connection-manager
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3**
 */

import mysql, { Pool, PoolOptions, RowDataPacket, FieldPacket } from 'mysql2/promise';
import { DatabaseConfig, QueryResult, FieldInfo, LIMITS } from './types.js';
import { validate } from './query-validator.js';

/**
 * Sensitive patterns to sanitize from error messages and logs
 */
const SENSITIVE_PATTERNS = [
  /password[=:]\s*['"]?[^'"\s]+['"]?/gi,
  /pwd[=:]\s*['"]?[^'"\s]+['"]?/gi,
  /secret[=:]\s*['"]?[^'"\s]+['"]?/gi,
  /token[=:]\s*['"]?[^'"\s]+['"]?/gi,
  /key[=:]\s*['"]?[^'"\s]+['"]?/gi,
  // Connection string URL format: mysql://user:password@host
  // Password can contain any character including @, so we match until the last @ before hostname
  /mysql:\/\/[^:]+:.+@[a-zA-Z0-9.-]+/gi
];

/**
 * Sanitizes sensitive data from a string
 * Removes passwords and other credentials from error messages
 * 
 * **Validates: Requirements 8.3, 8.4**
 */
export function sanitizeMessage(message: string): string {
  let sanitized = message;
  
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  
  return sanitized;
}

/**
 * Creates a safe error message without exposing credentials
 * 
 * **Validates: Requirements 1.2, 8.3**
 */
export function createConnectionErrorMessage(config: DatabaseConfig, error: Error): string {
  // Never include password in error message
  const safeDetails = `${config.name}@${config.host}:${config.port}/${config.database}`;
  const sanitizedError = sanitizeMessage(error.message);
  
  return `Database connection failed: ${safeDetails} - ${sanitizedError}`;
}


/**
 * Connection Manager class
 * Manages database connection pools and query execution
 */
export class ConnectionManager {
  private pool: Pool | null = null;
  private config: DatabaseConfig | null = null;

  /**
   * Initializes the connection pool for the configured database
   * 
   * @param config - Database configuration
   * 
   * **Validates: Requirements 1.1, 1.3**
   */
  async initialize(config: DatabaseConfig): Promise<void> {
    this.config = config;
    this.pool = this.createPool(config);
  }

  /**
   * Creates a MySQL connection pool with optimized settings
   */
  private createPool(config: DatabaseConfig): Pool {
    const poolOptions: PoolOptions = {
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000
    };

    return mysql.createPool(poolOptions);
  }

  /**
   * Gets the connection pool
   * 
   * @returns MySQL connection pool
   * @throws Error if pool not initialized
   */
  getPool(): Pool {
    const pool = this.pool;

    if (!pool) {
      throw new Error('Connection pool not initialized');
    }

    return pool;
  }

  /**
   * Gets the configured database name
   */
  getDatabaseName(): string {
    return this.config?.database || 'mysql';
  }

  /**
   * Tests connection to the configured database
   * 
   * @throws Error with sanitized message if connection fails
   * 
   * **Validates: Requirements 1.2**
   */
  async testConnection(): Promise<void> {
    const pool = this.getPool();
    const config = this.config;

    try {
      const connection = await pool.getConnection();
      connection.release();
    } catch (error) {
      if (config) {
        throw new Error(createConnectionErrorMessage(config, error as Error));
      }
      throw new Error('Database connection failed');
    }
  }


  /**
   * Executes a read-only query with timeout handling
   * 
   * @param query - SQL query to execute
   * @param params - Query parameters (optional)
   * @param limit - Maximum rows to return (optional)
   * @returns Query result with rows, fields, and metadata
   * 
   * **Validates: Requirements 1.3, 1.4, 5.3, 5.4**
   */
  async executeQuery(
    query: string,
    params: unknown[] = [],
    limit?: number
  ): Promise<QueryResult> {
    // Validate query is read-only
    const validation = validate(query);
    
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid query');
    }

    const pool = this.getPool();
    const effectiveLimit = limit ?? LIMITS.QUERY_DEFAULT;

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Query exceeded ${LIMITS.TIMEOUT_MS / 1000} second timeout limit`));
      }, LIMITS.TIMEOUT_MS);
    });

    // Execute query with timeout
    const queryPromise = this.executeWithLimit(pool, query, params, effectiveLimit);

    try {
      const result = await Promise.race([queryPromise, timeoutPromise]);
      return result;
    } catch (error) {
      // Sanitize error message before throwing
      const sanitizedMessage = sanitizeMessage((error as Error).message);
      throw new Error(sanitizedMessage);
    }
  }

  /**
   * Executes query with row limit enforcement
   */
  private async executeWithLimit(
    pool: Pool,
    query: string,
    params: unknown[],
    limit: number
  ): Promise<QueryResult> {
    // Request one more row than limit to detect truncation
    const queryWithLimit = this.addLimitToQuery(query, limit + 1);
    
    const [rows, fields] = await pool.execute<RowDataPacket[]>(queryWithLimit, params);
    
    // Check if results were truncated
    const truncated = rows.length > limit;
    const resultRows = truncated ? rows.slice(0, limit) : rows;

    // Map field info
    const fieldInfo: FieldInfo[] = (fields as FieldPacket[]).map(field => ({
      name: field.name,
      type: this.getFieldTypeName(field.type)
    }));

    return {
      rows: resultRows as Record<string, unknown>[],
      fields: fieldInfo,
      rowCount: resultRows.length,
      truncated
    };
  }

  /**
   * Adds LIMIT clause to query if not already present
   */
  private addLimitToQuery(query: string, limit: number): string {
    const normalizedQuery = query.trim().toUpperCase();
    
    // Check if query already has LIMIT
    if (/\bLIMIT\s+\d+/i.test(query)) {
      return query;
    }
    
    // Don't add LIMIT to SHOW, DESCRIBE, or EXPLAIN queries
    if (normalizedQuery.startsWith('SHOW') || 
        normalizedQuery.startsWith('DESCRIBE') || 
        normalizedQuery.startsWith('EXPLAIN')) {
      return query;
    }
    
    return `${query.trim()} LIMIT ${limit}`;
  }

  /**
   * Converts MySQL field type number to string name
   */
  private getFieldTypeName(typeNum: number | undefined): string {
    const typeMap: Record<number, string> = {
      0: 'DECIMAL',
      1: 'TINYINT',
      2: 'SMALLINT',
      3: 'INT',
      4: 'FLOAT',
      5: 'DOUBLE',
      6: 'NULL',
      7: 'TIMESTAMP',
      8: 'BIGINT',
      9: 'MEDIUMINT',
      10: 'DATE',
      11: 'TIME',
      12: 'DATETIME',
      13: 'YEAR',
      14: 'NEWDATE',
      15: 'VARCHAR',
      16: 'BIT',
      245: 'JSON',
      246: 'NEWDECIMAL',
      247: 'ENUM',
      248: 'SET',
      249: 'TINY_BLOB',
      250: 'MEDIUM_BLOB',
      251: 'LONG_BLOB',
      252: 'BLOB',
      253: 'VAR_STRING',
      254: 'STRING',
      255: 'GEOMETRY'
    };
    
    return typeMap[typeNum ?? 253] || 'UNKNOWN';
  }


  /**
   * Closes all connection pools
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }

    this.pool = null;
    this.config = null;
  }
}

/**
 * Creates database configuration from environment variables
 * 
 * @returns Database config
 */
export function createConfigFromEnv(): DatabaseConfig {
  return {
    name: process.env.MYSQL_DATABASE || 'mysql',
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'mysql'
  };
}

/**
 * Connection Manager interface for dependency injection
 */
export interface IConnectionManager {
  initialize(config: DatabaseConfig): Promise<void>;
  getPool(): Pool;
  getDatabaseName(): string;
  testConnection(): Promise<void>;
  executeQuery(
    query: string,
    params?: unknown[],
    limit?: number
  ): Promise<QueryResult>;
  close(): Promise<void>;
}

/**
 * Default connection manager instance
 */
export const connectionManager = new ConnectionManager();
