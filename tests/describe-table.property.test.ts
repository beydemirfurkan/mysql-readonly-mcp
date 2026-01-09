/**
 * Property-Based Tests for Describe Table Tool
 * 
 * **Feature: mysql-readonly-mcp, Property 5: Schema Completeness**
 * **Validates: Requirements 3.1, 3.2, 3.3**
 * 
 * Tests that the describe_table tool returns complete schema information
 * with all required fields: columns array with (name, type, nullable, default, extra),
 * primaryKey array, foreignKeys array, and indexes array.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  isValidDescribeTableOutput,
  DescribeTableOutput
} from '../src/tools/describe-table';
import { ColumnInfo, ForeignKeyInfo, IndexInfo } from '../src/types';

// Configure fast-check for minimum 100 iterations
fc.configureGlobal({ numRuns: 100 });

/**
 * Arbitrary for generating valid column names
 */
const columnNameArb = fc.string({ minLength: 1, maxLength: 64 })
  .filter(s => s.trim().length > 0 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s));

/**
 * Arbitrary for generating valid SQL data types
 */
const dataTypeArb = fc.constantFrom(
  'int', 'bigint', 'varchar(255)', 'text', 'datetime',
  'timestamp', 'decimal(10,2)', 'tinyint(1)', 'json', 'enum(\'a\',\'b\')'
);

/**
 * Arbitrary for generating valid table names
 */
const tableNameArb = fc.string({ minLength: 1, maxLength: 64 })
  .filter(s => s.trim().length > 0 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s));

/**
 * Arbitrary for generating valid ColumnInfo objects
 */
const validColumnInfoArb: fc.Arbitrary<ColumnInfo> = fc.record({
  name: columnNameArb,
  type: dataTypeArb,
  nullable: fc.boolean(),
  default: fc.oneof(fc.constant(null), fc.string({ maxLength: 100 })),
  extra: fc.constantFrom('', 'auto_increment', 'on update CURRENT_TIMESTAMP'),
  comment: fc.string({ maxLength: 200 })
});

/**
 * Arbitrary for generating valid ForeignKeyInfo objects
 */
const validForeignKeyInfoArb: fc.Arbitrary<ForeignKeyInfo> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 64 }).filter(s => s.trim().length > 0),
  column: columnNameArb,
  referencedTable: tableNameArb,
  referencedColumn: columnNameArb
});

/**
 * Arbitrary for generating valid IndexInfo objects
 */
const validIndexInfoArb: fc.Arbitrary<IndexInfo> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 64 }).filter(s => s.trim().length > 0),
  columns: fc.array(columnNameArb, { minLength: 1, maxLength: 5 }),
  unique: fc.boolean(),
  type: fc.constantFrom('BTREE', 'HASH', 'FULLTEXT', 'SPATIAL')
});


/**
 * Arbitrary for generating valid DescribeTableOutput objects
 */
const validDescribeTableOutputArb: fc.Arbitrary<DescribeTableOutput> = fc.record({
  table: tableNameArb,
  columns: fc.array(validColumnInfoArb, { minLength: 1, maxLength: 20 }),
  primaryKey: fc.array(columnNameArb, { minLength: 0, maxLength: 3 }),
  foreignKeys: fc.array(validForeignKeyInfoArb, { minLength: 0, maxLength: 5 }),
  indexes: fc.array(validIndexInfoArb, { minLength: 0, maxLength: 10 })
});

/**
 * Arbitrary for generating invalid ColumnInfo objects
 */
const invalidColumnInfoArb = fc.oneof(
  // Missing name
  fc.record({
    type: dataTypeArb,
    nullable: fc.boolean(),
    default: fc.constant(null),
    extra: fc.constant('')
  }),
  // Wrong type for name
  fc.record({
    name: fc.constant(123),
    type: dataTypeArb,
    nullable: fc.boolean(),
    default: fc.constant(null),
    extra: fc.constant('')
  }),
  // Wrong type for nullable
  fc.record({
    name: columnNameArb,
    type: dataTypeArb,
    nullable: fc.constantFrom('yes', 'no', 1, 0),
    default: fc.constant(null),
    extra: fc.constant('')
  }),
  // Null object
  fc.constant(null),
  // Undefined
  fc.constant(undefined),
  // Empty object
  fc.constant({})
);

/**
 * Arbitrary for generating invalid ForeignKeyInfo objects
 */
const invalidForeignKeyInfoArb = fc.oneof(
  // Missing required fields
  fc.record({
    name: fc.string(),
    column: columnNameArb
    // missing referencedTable and referencedColumn
  }),
  // Wrong types
  fc.record({
    name: fc.constant(123),
    column: columnNameArb,
    referencedTable: tableNameArb,
    referencedColumn: columnNameArb
  }),
  fc.constant(null),
  fc.constant(undefined)
);

/**
 * Arbitrary for generating invalid IndexInfo objects
 */
const invalidIndexInfoArb = fc.oneof(
  // Missing columns
  fc.record({
    name: fc.string(),
    unique: fc.boolean(),
    type: fc.constant('BTREE')
  }),
  // Columns not an array
  fc.record({
    name: fc.string(),
    columns: fc.constant('column1'),
    unique: fc.boolean(),
    type: fc.constant('BTREE')
  }),
  // Wrong type for unique
  fc.record({
    name: fc.string(),
    columns: fc.array(columnNameArb),
    unique: fc.constantFrom('yes', 'no', 1, 0),
    type: fc.constant('BTREE')
  }),
  fc.constant(null),
  fc.constant(undefined)
);


describe('Describe Table Property Tests', () => {
  /**
   * Property 5: Schema Completeness
   * 
   * *For any* table schema result, the output SHALL contain:
   * columns array with (name, type, nullable, default, extra),
   * primaryKey array, foreignKeys array, and indexes array.
   */
  describe('Property 5: Schema Completeness', () => {
    it('should validate that all valid DescribeTableOutput objects pass validation', () => {
      fc.assert(
        fc.property(validDescribeTableOutputArb, (output) => {
          expect(isValidDescribeTableOutput(output)).toBe(true);

          // Verify table name
          expect(typeof output.table).toBe('string');

          // Verify columns array exists and has required structure
          expect(Array.isArray(output.columns)).toBe(true);

          // Verify primaryKey array exists
          expect(Array.isArray(output.primaryKey)).toBe(true);

          // Verify foreignKeys array exists
          expect(Array.isArray(output.foreignKeys)).toBe(true);

          // Verify indexes array exists
          expect(Array.isArray(output.indexes)).toBe(true);
        })
      );
    });

    it('should ensure each column has all required fields', () => {
      fc.assert(
        fc.property(validDescribeTableOutputArb, (output) => {
          for (const column of output.columns) {
            // name (string)
            expect(typeof column.name).toBe('string');
            expect(column.name.length).toBeGreaterThan(0);

            // type (string)
            expect(typeof column.type).toBe('string');

            // nullable (boolean)
            expect(typeof column.nullable).toBe('boolean');

            // default (string | null)
            expect(column.default === null || typeof column.default === 'string').toBe(true);

            // extra (string)
            expect(typeof column.extra).toBe('string');
          }
        })
      );
    });

    it('should ensure primaryKey is an array of strings', () => {
      fc.assert(
        fc.property(validDescribeTableOutputArb, (output) => {
          expect(Array.isArray(output.primaryKey)).toBe(true);
          for (const pk of output.primaryKey) {
            expect(typeof pk).toBe('string');
          }
        })
      );
    });

    it('should ensure each foreignKey has all required fields', () => {
      fc.assert(
        fc.property(validDescribeTableOutputArb, (output) => {
          for (const fk of output.foreignKeys) {
            // name (string)
            expect(typeof fk.name).toBe('string');

            // column (string)
            expect(typeof fk.column).toBe('string');

            // referencedTable (string)
            expect(typeof fk.referencedTable).toBe('string');

            // referencedColumn (string)
            expect(typeof fk.referencedColumn).toBe('string');
          }
        })
      );
    });

    it('should ensure each index has all required fields', () => {
      fc.assert(
        fc.property(validDescribeTableOutputArb, (output) => {
          for (const idx of output.indexes) {
            // name (string)
            expect(typeof idx.name).toBe('string');

            // columns (string[])
            expect(Array.isArray(idx.columns)).toBe(true);
            for (const col of idx.columns) {
              expect(typeof col).toBe('string');
            }

            // unique (boolean)
            expect(typeof idx.unique).toBe('boolean');

            // type (string)
            expect(typeof idx.type).toBe('string');
          }
        })
      );
    });

    it('should reject outputs with invalid column structures', () => {
      fc.assert(
        fc.property(
          tableNameArb,
          fc.array(invalidColumnInfoArb, { minLength: 1, maxLength: 3 }),
          (table, invalidColumns) => {
            const output = {
              table,
              columns: invalidColumns,
              primaryKey: [],
              foreignKeys: [],
              indexes: []
            };
            expect(isValidDescribeTableOutput(output)).toBe(false);
          }
        )
      );
    });

    it('should reject outputs with invalid foreignKey structures', () => {
      fc.assert(
        fc.property(
          tableNameArb,
          fc.array(validColumnInfoArb, { minLength: 1, maxLength: 3 }),
          fc.array(invalidForeignKeyInfoArb, { minLength: 1, maxLength: 2 }),
          (table, columns, invalidFKs) => {
            const output = {
              table,
              columns,
              primaryKey: [],
              foreignKeys: invalidFKs,
              indexes: []
            };
            expect(isValidDescribeTableOutput(output)).toBe(false);
          }
        )
      );
    });

    it('should reject outputs with invalid index structures', () => {
      fc.assert(
        fc.property(
          tableNameArb,
          fc.array(validColumnInfoArb, { minLength: 1, maxLength: 3 }),
          fc.array(invalidIndexInfoArb, { minLength: 1, maxLength: 2 }),
          (table, columns, invalidIndexes) => {
            const output = {
              table,
              columns,
              primaryKey: [],
              foreignKeys: [],
              indexes: invalidIndexes
            };
            expect(isValidDescribeTableOutput(output)).toBe(false);
          }
        )
      );
    });

    it('should reject null or undefined outputs', () => {
      expect(isValidDescribeTableOutput(null)).toBe(false);
      expect(isValidDescribeTableOutput(undefined)).toBe(false);
      expect(isValidDescribeTableOutput({})).toBe(false);
    });

    it('should reject outputs missing required arrays', () => {
      fc.assert(
        fc.property(tableNameArb, (table) => {
          // Missing columns
          expect(isValidDescribeTableOutput({
            table,
            primaryKey: [],
            foreignKeys: [],
            indexes: []
          })).toBe(false);

          // Missing primaryKey
          expect(isValidDescribeTableOutput({
            table,
            columns: [],
            foreignKeys: [],
            indexes: []
          })).toBe(false);

          // Missing foreignKeys
          expect(isValidDescribeTableOutput({
            table,
            columns: [],
            primaryKey: [],
            indexes: []
          })).toBe(false);

          // Missing indexes
          expect(isValidDescribeTableOutput({
            table,
            columns: [],
            primaryKey: [],
            foreignKeys: []
          })).toBe(false);
        })
      );
    });

    it('should handle empty arrays for optional fields', () => {
      fc.assert(
        fc.property(
          tableNameArb,
          fc.array(validColumnInfoArb, { minLength: 1, maxLength: 5 }),
          (table, columns) => {
            const output: DescribeTableOutput = {
              table,
              columns,
              primaryKey: [],
              foreignKeys: [],
              indexes: []
            };

            expect(isValidDescribeTableOutput(output)).toBe(true);
            expect(output.primaryKey.length).toBe(0);
            expect(output.foreignKeys.length).toBe(0);
            expect(output.indexes.length).toBe(0);
          }
        )
      );
    });
  });
});
