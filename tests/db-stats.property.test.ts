/**
 * Property-Based Tests for Database Stats Tool
 * 
 * **Feature: mysql-readonly-mcp, Property 9: Stats Top Tables Limit**
 * **Validates: Requirements 7.2, 7.3**
 * 
 * Tests that for any database stats result, the largestByRows and largestBySize
 * arrays SHALL each contain at most 10 entries, sorted in descending order
 * by their respective metrics.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  isValidDbStatsOutput,
  isValidTableStat,
  isDescendingByRows,
  isDescendingBySize,
  parseSizeToBytes,
  DbStatsOutput,
  MAX_TOP_TABLES
} from '../src/tools/db-stats';
import { TableStat } from '../src/types';

// Configure fast-check for minimum 100 iterations
fc.configureGlobal({ numRuns: 100 });

/**
 * Arbitrary for generating valid database names
 */
const databaseNameArb = fc.constantFrom('crm', 'operation');

/**
 * Arbitrary for generating valid table names
 */
const tableNameArb = fc.string({ minLength: 1, maxLength: 64 })
  .filter(s => s.trim().length > 0 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s));

/**
 * Arbitrary for generating valid size strings
 */
const sizeStringArb = fc.tuple(
  fc.integer({ min: 1, max: 99999 }).map(n => n / 100),
  fc.constantFrom('B', 'KB', 'MB', 'GB', 'TB')
).map(([value, unit]) => `${value.toFixed(2)} ${unit}`);

/**
 * Arbitrary for generating valid TableStat objects
 */
const validTableStatArb: fc.Arbitrary<TableStat> = fc.record({
  table: tableNameArb,
  rows: fc.nat({ max: 10000000 }),
  size: sizeStringArb
});

/**
 * Arbitrary for generating sorted TableStat arrays by rows (descending)
 */
const sortedByRowsArb = (maxLength: number): fc.Arbitrary<TableStat[]> =>
  fc.array(validTableStatArb, { minLength: 0, maxLength })
    .map(stats => [...stats].sort((a, b) => b.rows - a.rows));

/**
 * Arbitrary for generating sorted TableStat arrays by size (descending)
 */
const sortedBySizeArb = (maxLength: number): fc.Arbitrary<TableStat[]> =>
  fc.array(validTableStatArb, { minLength: 0, maxLength })
    .map(stats => [...stats].sort((a, b) => parseSizeToBytes(b.size) - parseSizeToBytes(a.size)));

/**
 * Arbitrary for generating valid DbStatsOutput objects
 */
const validDbStatsOutputArb: fc.Arbitrary<DbStatsOutput> = fc.record({
  database: databaseNameArb,
  tableCount: fc.nat({ max: 1000 }),
  totalRows: fc.nat({ max: 100000000 }),
  totalSize: sizeStringArb,
  largestByRows: sortedByRowsArb(MAX_TOP_TABLES),
  largestBySize: sortedBySizeArb(MAX_TOP_TABLES)
});

/**
 * Arbitrary for generating invalid DbStatsOutput (exceeds limit)
 */
const invalidDbStatsExceedsLimitArb = fc.record({
  database: databaseNameArb,
  tableCount: fc.nat({ max: 1000 }),
  totalRows: fc.nat({ max: 100000000 }),
  totalSize: sizeStringArb,
  largestByRows: fc.array(validTableStatArb, { minLength: 11, maxLength: 20 }),
  largestBySize: fc.array(validTableStatArb, { minLength: 11, maxLength: 20 })
});

/**
 * Arbitrary for generating invalid TableStat objects
 */
const invalidTableStatArb = fc.oneof(
  // Missing table
  fc.record({
    rows: fc.nat(),
    size: sizeStringArb
  }),
  // Missing rows
  fc.record({
    table: tableNameArb,
    size: sizeStringArb
  }),
  // Missing size
  fc.record({
    table: tableNameArb,
    rows: fc.nat()
  }),
  // Wrong types
  fc.record({
    table: fc.nat(),
    rows: fc.string(),
    size: fc.nat()
  }),
  // Null/undefined
  fc.constant(null),
  fc.constant(undefined),
  fc.constant({})
);


describe('Database Stats Property Tests', () => {
  /**
   * Property 9: Stats Top Tables Limit
   * 
   * *For any* database stats result, the largestByRows and largestBySize arrays
   * SHALL each contain at most 10 entries, sorted in descending order by their
   * respective metrics.
   */
  describe('Property 9: Stats Top Tables Limit', () => {
    it('should validate that all valid DbStatsOutput objects pass validation', () => {
      fc.assert(
        fc.property(validDbStatsOutputArb, (output) => {
          expect(isValidDbStatsOutput(output)).toBe(true);

          // Verify required fields
          expect(typeof output.database).toBe('string');
          expect(typeof output.tableCount).toBe('number');
          expect(typeof output.totalRows).toBe('number');
          expect(typeof output.totalSize).toBe('string');
          expect(Array.isArray(output.largestByRows)).toBe(true);
          expect(Array.isArray(output.largestBySize)).toBe(true);
        })
      );
    });

    it('should ensure largestByRows contains at most 10 entries', () => {
      fc.assert(
        fc.property(validDbStatsOutputArb, (output) => {
          expect(output.largestByRows.length).toBeLessThanOrEqual(MAX_TOP_TABLES);
        })
      );
    });

    it('should ensure largestBySize contains at most 10 entries', () => {
      fc.assert(
        fc.property(validDbStatsOutputArb, (output) => {
          expect(output.largestBySize.length).toBeLessThanOrEqual(MAX_TOP_TABLES);
        })
      );
    });

    it('should reject outputs where largestByRows exceeds 10 entries', () => {
      fc.assert(
        fc.property(invalidDbStatsExceedsLimitArb, (output) => {
          expect(isValidDbStatsOutput(output)).toBe(false);
        })
      );
    });

    it('should reject outputs where largestBySize exceeds 10 entries', () => {
      fc.assert(
        fc.property(
          databaseNameArb,
          fc.nat({ max: 1000 }),
          fc.nat({ max: 100000000 }),
          sizeStringArb,
          sortedByRowsArb(MAX_TOP_TABLES),
          fc.array(validTableStatArb, { minLength: 11, maxLength: 20 }),
          (database, tableCount, totalRows, totalSize, largestByRows, largestBySize) => {
            const output = {
              database,
              tableCount,
              totalRows,
              totalSize,
              largestByRows,
              largestBySize
            };
            expect(isValidDbStatsOutput(output)).toBe(false);
          }
        )
      );
    });

    it('should ensure largestByRows is sorted in descending order', () => {
      fc.assert(
        fc.property(sortedByRowsArb(MAX_TOP_TABLES), (stats) => {
          expect(isDescendingByRows(stats)).toBe(true);
        })
      );
    });

    it('should ensure largestBySize is sorted in descending order', () => {
      fc.assert(
        fc.property(sortedBySizeArb(MAX_TOP_TABLES), (stats) => {
          expect(isDescendingBySize(stats)).toBe(true);
        })
      );
    });

    it('should detect unsorted largestByRows arrays', () => {
      fc.assert(
        fc.property(
          fc.array(validTableStatArb, { minLength: 2, maxLength: 10 }),
          (stats) => {
            // Reverse sort to make it ascending (wrong order)
            const ascending = [...stats].sort((a, b) => a.rows - b.rows);
            
            // Only test if there are different row values
            const hasVariation = ascending.some((s, i) => 
              i > 0 && s.rows !== ascending[i - 1].rows
            );
            
            if (hasVariation) {
              expect(isDescendingByRows(ascending)).toBe(false);
            }
          }
        )
      );
    });

    it('should validate individual TableStat objects', () => {
      fc.assert(
        fc.property(validTableStatArb, (stat) => {
          expect(isValidTableStat(stat)).toBe(true);

          // Verify required fields
          expect(typeof stat.table).toBe('string');
          expect(typeof stat.rows).toBe('number');
          expect(typeof stat.size).toBe('string');
        })
      );
    });

    it('should reject invalid TableStat objects', () => {
      fc.assert(
        fc.property(invalidTableStatArb, (stat) => {
          expect(isValidTableStat(stat)).toBe(false);
        })
      );
    });

    it('should handle empty arrays for top tables', () => {
      fc.assert(
        fc.property(
          databaseNameArb,
          fc.nat({ max: 1000 }),
          fc.nat({ max: 100000000 }),
          sizeStringArb,
          (database, tableCount, totalRows, totalSize) => {
            const output: DbStatsOutput = {
              database,
              tableCount,
              totalRows,
              totalSize,
              largestByRows: [],
              largestBySize: []
            };

            expect(isValidDbStatsOutput(output)).toBe(true);
            expect(output.largestByRows.length).toBe(0);
            expect(output.largestBySize.length).toBe(0);
          }
        )
      );
    });

    it('should reject null or undefined outputs', () => {
      expect(isValidDbStatsOutput(null)).toBe(false);
      expect(isValidDbStatsOutput(undefined)).toBe(false);
      expect(isValidDbStatsOutput({})).toBe(false);
    });

    it('should reject outputs missing required fields', () => {
      fc.assert(
        fc.property(databaseNameArb, (database) => {
          // Missing tableCount
          expect(isValidDbStatsOutput({
            database,
            totalRows: 100,
            totalSize: '1 MB',
            largestByRows: [],
            largestBySize: []
          })).toBe(false);

          // Missing totalRows
          expect(isValidDbStatsOutput({
            database,
            tableCount: 10,
            totalSize: '1 MB',
            largestByRows: [],
            largestBySize: []
          })).toBe(false);

          // Missing totalSize
          expect(isValidDbStatsOutput({
            database,
            tableCount: 10,
            totalRows: 100,
            largestByRows: [],
            largestBySize: []
          })).toBe(false);

          // Missing largestByRows
          expect(isValidDbStatsOutput({
            database,
            tableCount: 10,
            totalRows: 100,
            totalSize: '1 MB',
            largestBySize: []
          })).toBe(false);

          // Missing largestBySize
          expect(isValidDbStatsOutput({
            database,
            tableCount: 10,
            totalRows: 100,
            totalSize: '1 MB',
            largestByRows: []
          })).toBe(false);
        })
      );
    });

    it('should correctly parse size strings to bytes', () => {
      expect(parseSizeToBytes('1 B')).toBe(1);
      expect(parseSizeToBytes('1 KB')).toBe(1024);
      expect(parseSizeToBytes('1 MB')).toBe(1024 * 1024);
      expect(parseSizeToBytes('1 GB')).toBe(1024 * 1024 * 1024);
      expect(parseSizeToBytes('1.5 MB')).toBe(1.5 * 1024 * 1024);
      expect(parseSizeToBytes('invalid')).toBe(0);
    });

    it('should handle boundary case of exactly 10 entries', () => {
      fc.assert(
        fc.property(
          databaseNameArb,
          fc.nat({ max: 1000 }),
          fc.nat({ max: 100000000 }),
          sizeStringArb,
          fc.array(validTableStatArb, { minLength: 10, maxLength: 10 }),
          fc.array(validTableStatArb, { minLength: 10, maxLength: 10 }),
          (database, tableCount, totalRows, totalSize, byRows, bySize) => {
            const output: DbStatsOutput = {
              database,
              tableCount,
              totalRows,
              totalSize,
              largestByRows: byRows.sort((a, b) => b.rows - a.rows),
              largestBySize: bySize.sort((a, b) => 
                parseSizeToBytes(b.size) - parseSizeToBytes(a.size)
              )
            };

            expect(isValidDbStatsOutput(output)).toBe(true);
            expect(output.largestByRows.length).toBe(10);
            expect(output.largestBySize.length).toBe(10);
          }
        )
      );
    });
  });
});
