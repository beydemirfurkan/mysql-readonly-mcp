/**
 * Property-Based Tests for Query Validator
 * 
 * **Feature: mysql-readonly-mcp, Property 1: Read-Only Query Validation**
 * **Validates: Requirements 1.4, 5.1, 5.2, 8.1, 8.2**
 * 
 * Tests that the query validator correctly accepts only read-only queries
 * and rejects any query containing data modification keywords.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { 
  isReadOnly, 
  validate, 
  FORBIDDEN_KEYWORDS, 
  ALLOWED_STATEMENTS 
} from '../src/query-validator';

// Configure fast-check for minimum 100 iterations
fc.configureGlobal({ numRuns: 100 });

/**
 * Arbitrary for generating valid table names
 */
const tableNameArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'.split('')),
  { minLength: 1, maxLength: 20 }
);

/**
 * Arbitrary for generating valid column names
 */
const columnNameArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'.split('')),
  { minLength: 1, maxLength: 15 }
);

/**
 * Arbitrary for generating valid SELECT queries
 */
const validSelectQueryArb = fc.tuple(
  fc.array(columnNameArb, { minLength: 1, maxLength: 5 }),
  tableNameArb
).map(([columns, table]) => `SELECT ${columns.join(', ')} FROM ${table}`);

/**
 * Arbitrary for generating valid SHOW queries
 */
const validShowQueryArb = fc.constantFrom(
  'SHOW TABLES',
  'SHOW DATABASES',
  'SHOW TABLE STATUS',
  'SHOW INDEX FROM users',
  'SHOW CREATE TABLE orders'
);

/**
 * Arbitrary for generating valid DESCRIBE queries
 */
const validDescribeQueryArb = tableNameArb.map(table => `DESCRIBE ${table}`);

/**
 * Arbitrary for generating valid EXPLAIN queries
 */
const validExplainQueryArb = validSelectQueryArb.map(query => `EXPLAIN ${query}`);

/**
 * Arbitrary for generating any valid read-only query
 */
const validReadOnlyQueryArb = fc.oneof(
  validSelectQueryArb,
  validShowQueryArb,
  validDescribeQueryArb,
  validExplainQueryArb
);

/**
 * Arbitrary for generating queries with forbidden keywords
 */
const forbiddenKeywordArb = fc.constantFrom(...FORBIDDEN_KEYWORDS);

/**
 * Arbitrary for generating invalid queries starting with forbidden keywords
 */
const invalidQueryStartingWithForbiddenArb = fc.tuple(
  forbiddenKeywordArb,
  tableNameArb
).map(([keyword, table]) => {
  switch (keyword) {
    case 'INSERT':
      return `INSERT INTO ${table} (col) VALUES (1)`;
    case 'UPDATE':
      return `UPDATE ${table} SET col = 1`;
    case 'DELETE':
      return `DELETE FROM ${table}`;
    case 'DROP':
      return `DROP TABLE ${table}`;
    case 'ALTER':
      return `ALTER TABLE ${table} ADD col INT`;
    case 'TRUNCATE':
      return `TRUNCATE TABLE ${table}`;
    case 'CREATE':
      return `CREATE TABLE ${table} (id INT)`;
    case 'REPLACE':
      return `REPLACE INTO ${table} (col) VALUES (1)`;
    case 'GRANT':
      return `GRANT SELECT ON ${table} TO user`;
    case 'REVOKE':
      return `REVOKE SELECT ON ${table} FROM user`;
    case 'LOCK':
      return `LOCK TABLES ${table} READ`;
    case 'UNLOCK':
      return `UNLOCK TABLES`;
    default:
      return `${keyword} ${table}`;
  }
});

/**
 * Arbitrary for generating SELECT queries that contain forbidden keywords in subqueries
 */
const selectWithForbiddenSubqueryArb = fc.tuple(
  tableNameArb,
  forbiddenKeywordArb,
  tableNameArb
).map(([table1, keyword, table2]) => {
  // Create a SELECT that contains a forbidden keyword
  return `SELECT * FROM ${table1}; ${keyword} FROM ${table2}`;
});

describe('Query Validator Property Tests', () => {
  /**
   * Property 1: Read-Only Query Validation
   * 
   * *For any* query string submitted to the MCP_Server, the query validator 
   * SHALL accept only queries starting with SELECT, SHOW, DESCRIBE, or EXPLAIN,
   * and SHALL reject any query containing INSERT, UPDATE, DELETE, DROP, ALTER, 
   * TRUNCATE, CREATE, REPLACE, GRANT, REVOKE, LOCK, or UNLOCK keywords.
   */
  describe('Property 1: Read-Only Query Validation', () => {
    it('should accept all valid read-only queries (SELECT, SHOW, DESCRIBE, EXPLAIN)', () => {
      fc.assert(
        fc.property(validReadOnlyQueryArb, (query) => {
          const result = validate(query);
          expect(result.valid).toBe(true);
          expect(result.queryType).toBeDefined();
          expect(ALLOWED_STATEMENTS).toContain(result.queryType);
          expect(isReadOnly(query)).toBe(true);
        })
      );
    });

    it('should reject all queries starting with forbidden keywords', () => {
      fc.assert(
        fc.property(invalidQueryStartingWithForbiddenArb, (query) => {
          const result = validate(query);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(isReadOnly(query)).toBe(false);
        })
      );
    });

    it('should reject queries containing forbidden keywords anywhere', () => {
      fc.assert(
        fc.property(selectWithForbiddenSubqueryArb, (query) => {
          const result = validate(query);
          // Should be rejected because it contains forbidden keywords
          expect(result.valid).toBe(false);
          expect(isReadOnly(query)).toBe(false);
        })
      );
    });

    it('should handle queries with various whitespace and comments', () => {
      fc.assert(
        fc.property(
          validSelectQueryArb,
          fc.constantFrom('', '  ', '\n', '\t', '-- comment\n', '/* comment */'),
          (query, prefix) => {
            const queryWithPrefix = prefix + query;
            const result = validate(queryWithPrefix);
            // Should still be valid after normalization
            expect(result.valid).toBe(true);
            expect(isReadOnly(queryWithPrefix)).toBe(true);
          }
        )
      );
    });

    it('should be case-insensitive for statement detection', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('select', 'SELECT', 'Select', 'sElEcT'),
          tableNameArb,
          (selectKeyword, table) => {
            const query = `${selectKeyword} * FROM ${table}`;
            const result = validate(query);
            expect(result.valid).toBe(true);
            expect(result.queryType).toBe('SELECT');
          }
        )
      );
    });

    it('should be case-insensitive for forbidden keyword detection', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('insert', 'INSERT', 'Insert', 'iNsErT'),
          tableNameArb,
          (insertKeyword, table) => {
            const query = `${insertKeyword} INTO ${table} (col) VALUES (1)`;
            const result = validate(query);
            expect(result.valid).toBe(false);
            expect(isReadOnly(query)).toBe(false);
          }
        )
      );
    });

    it('should not false-positive on table/column names containing keyword substrings', () => {
      // Table names like "updated_at" or "deleted_records" should not trigger rejection
      fc.assert(
        fc.property(
          fc.constantFrom(
            'SELECT * FROM updated_records',
            'SELECT deleted_at FROM users',
            'SELECT insert_date FROM logs',
            'SELECT drop_count FROM stats',
            'SELECT alter_log FROM changes',
            'SELECT truncated_text FROM articles',
            'SELECT created_at FROM posts',
            'SELECT replacement_id FROM items',
            'SELECT granted_access FROM permissions',
            'SELECT revoked_at FROM tokens',
            'SELECT locked_until FROM accounts',
            'SELECT unlocked_by FROM sessions'
          ),
          (query) => {
            const result = validate(query);
            expect(result.valid).toBe(true);
            expect(isReadOnly(query)).toBe(true);
          }
        )
      );
    });

    it('should reject empty or invalid queries', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('', '   ', '\n\n', '-- only comment', '/* only comment */'),
          (query) => {
            const result = validate(query);
            expect(result.valid).toBe(false);
            expect(isReadOnly(query)).toBe(false);
          }
        )
      );
    });

    it('should validate query type is correctly identified', () => {
      const queryTypeTests = [
        { prefix: 'SELECT', expected: 'SELECT' },
        { prefix: 'SHOW', expected: 'SHOW' },
        { prefix: 'DESCRIBE', expected: 'DESCRIBE' },
        { prefix: 'EXPLAIN', expected: 'EXPLAIN' }
      ];

      for (const { prefix, expected } of queryTypeTests) {
        fc.assert(
          fc.property(tableNameArb, (table) => {
            let query: string;
            switch (prefix) {
              case 'SELECT':
                query = `${prefix} * FROM ${table}`;
                break;
              case 'SHOW':
                query = `${prefix} TABLES`;
                break;
              case 'DESCRIBE':
                query = `${prefix} ${table}`;
                break;
              case 'EXPLAIN':
                query = `${prefix} SELECT * FROM ${table}`;
                break;
              default:
                query = `${prefix} ${table}`;
            }
            const result = validate(query);
            expect(result.valid).toBe(true);
            expect(result.queryType).toBe(expected);
          })
        );
      }
    });
  });
});
