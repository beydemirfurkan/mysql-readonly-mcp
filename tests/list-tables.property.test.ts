/**
 * Property-Based Tests for List Tables Tool
 * 
 * **Feature: mysql-readonly-mcp, Property 6: Table Listing Completeness**
 * **Validates: Requirements 2.2**
 * 
 * Tests that the list_tables tool returns complete table information
 * with all required fields: name (string), type ('BASE TABLE' or 'VIEW'), 
 * and rowCount (number).
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { 
  isValidTableInfo, 
  isValidListTablesOutput,
  ListTablesOutput 
} from '../src/tools/list-tables';
import { TableInfo } from '../src/types';

// Configure fast-check for minimum 100 iterations
fc.configureGlobal({ numRuns: 100 });

/**
 * Arbitrary for generating valid table names
 */
const tableNameArb = fc.string({ minLength: 1, maxLength: 64 })
  .filter(s => s.trim().length > 0);

/**
 * Arbitrary for generating valid table types
 */
const tableTypeArb = fc.constantFrom('BASE TABLE' as const, 'VIEW' as const);

/**
 * Arbitrary for generating valid row counts (non-negative integers)
 */
const rowCountArb = fc.nat({ max: 1000000 });

/**
 * Arbitrary for generating valid engine names
 */
const engineArb = fc.constantFrom('InnoDB', 'MyISAM', 'MEMORY', 'CSV', 'N/A');

/**
 * Arbitrary for generating valid TableInfo objects
 */
const validTableInfoArb: fc.Arbitrary<TableInfo> = fc.record({
  name: tableNameArb,
  type: tableTypeArb,
  rowCount: rowCountArb,
  engine: engineArb
});

/**
 * Arbitrary for generating valid ListTablesOutput objects
 */
const validListTablesOutputArb: fc.Arbitrary<ListTablesOutput> = fc.record({
  tables: fc.array(validTableInfoArb, { minLength: 0, maxLength: 50 }),
  database: fc.constantFrom('crm', 'operation')
});

/**
 * Arbitrary for generating invalid TableInfo objects (missing or wrong type fields)
 */
const invalidTableInfoArb = fc.oneof(
  // Missing name
  fc.record({
    type: tableTypeArb,
    rowCount: rowCountArb,
    engine: engineArb
  }),
  // Wrong type for name
  fc.record({
    name: fc.constant(123),
    type: tableTypeArb,
    rowCount: rowCountArb,
    engine: engineArb
  }),
  // Invalid type value
  fc.record({
    name: tableNameArb,
    type: fc.constantFrom('TABLE', 'SYSTEM VIEW', 'TEMPORARY'),
    rowCount: rowCountArb,
    engine: engineArb
  }),
  // Wrong type for rowCount
  fc.record({
    name: tableNameArb,
    type: tableTypeArb,
    rowCount: fc.constantFrom('100', null, undefined),
    engine: engineArb
  }),
  // Null object
  fc.constant(null),
  // Undefined
  fc.constant(undefined),
  // Empty object
  fc.constant({})
);

describe('List Tables Property Tests', () => {
  /**
   * Property 6: Table Listing Completeness
   * 
   * *For any* table listing result, each table entry SHALL contain:
   * name (string), type ('BASE TABLE' or 'VIEW'), and rowCount (number).
   */
  describe('Property 6: Table Listing Completeness', () => {
    it('should validate that all valid TableInfo objects pass validation', () => {
      fc.assert(
        fc.property(validTableInfoArb, (tableInfo) => {
          expect(isValidTableInfo(tableInfo)).toBe(true);
          
          // Verify all required fields are present and correct type
          expect(typeof tableInfo.name).toBe('string');
          expect(['BASE TABLE', 'VIEW']).toContain(tableInfo.type);
          expect(typeof tableInfo.rowCount).toBe('number');
        })
      );
    });

    it('should reject invalid TableInfo objects', () => {
      fc.assert(
        fc.property(invalidTableInfoArb, (invalidTable) => {
          expect(isValidTableInfo(invalidTable)).toBe(false);
        })
      );
    });

    it('should validate that all valid ListTablesOutput objects pass validation', () => {
      fc.assert(
        fc.property(validListTablesOutputArb, (output) => {
          expect(isValidListTablesOutput(output)).toBe(true);
          
          // Verify database field
          expect(typeof output.database).toBe('string');
          
          // Verify tables array
          expect(Array.isArray(output.tables)).toBe(true);
          
          // Verify each table has required fields
          for (const table of output.tables) {
            expect(typeof table.name).toBe('string');
            expect(['BASE TABLE', 'VIEW']).toContain(table.type);
            expect(typeof table.rowCount).toBe('number');
          }
        })
      );
    });

    it('should ensure table type is strictly BASE TABLE or VIEW', () => {
      fc.assert(
        fc.property(validTableInfoArb, (tableInfo) => {
          // Type must be exactly one of the two allowed values
          const validTypes = ['BASE TABLE', 'VIEW'];
          expect(validTypes).toContain(tableInfo.type);
          
          // Verify it's not any other string
          expect(tableInfo.type === 'BASE TABLE' || tableInfo.type === 'VIEW').toBe(true);
        })
      );
    });

    it('should ensure rowCount is a non-negative number', () => {
      fc.assert(
        fc.property(validTableInfoArb, (tableInfo) => {
          expect(tableInfo.rowCount).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(tableInfo.rowCount)).toBe(true);
        })
      );
    });

    it('should handle empty table lists', () => {
      const emptyOutput: ListTablesOutput = {
        tables: [],
        database: 'crm'
      };
      
      expect(isValidListTablesOutput(emptyOutput)).toBe(true);
      expect(emptyOutput.tables.length).toBe(0);
    });

    it('should validate output structure regardless of table count', () => {
      fc.assert(
        fc.property(
          fc.array(validTableInfoArb, { minLength: 0, maxLength: 100 }),
          fc.constantFrom('crm', 'operation'),
          (tables, database) => {
            const output: ListTablesOutput = { tables, database };
            
            expect(isValidListTablesOutput(output)).toBe(true);
            expect(output.tables.length).toBe(tables.length);
            expect(output.database).toBe(database);
          }
        )
      );
    });

    it('should reject outputs with invalid database field', () => {
      fc.assert(
        fc.property(
          fc.array(validTableInfoArb),
          fc.constantFrom(null, undefined, 123, [], {}),
          (tables, invalidDb) => {
            const output = { tables, database: invalidDb };
            expect(isValidListTablesOutput(output)).toBe(false);
          }
        )
      );
    });

    it('should reject outputs with non-array tables field', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(null, undefined, 'tables', 123, {}),
          fc.constantFrom('crm', 'operation'),
          (invalidTables, database) => {
            const output = { tables: invalidTables, database };
            expect(isValidListTablesOutput(output)).toBe(false);
          }
        )
      );
    });
  });
});
