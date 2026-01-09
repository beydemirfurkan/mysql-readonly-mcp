/**
 * Property-Based Tests for Run Query Tool
 * 
 * **Feature: mysql-readonly-mcp**
 * **Property 4: Truncation Flag Consistency**
 * **Validates: Requirements 5.5**
 * 
 * Tests that the run_query tool correctly sets the truncation flag
 * when query results exceed the specified limit.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { 
  enforceQueryLimit,
  isValidRunQueryOutput,
  isTruncationFlagConsistent
} from '../src/tools/run-query';
import { LIMITS } from '../src/types';

// Configure fast-check for minimum 100 iterations
fc.configureGlobal({ numRuns: 100 });

/**
 * Arbitrary for generating valid query limit values
 */
const validLimitArb = fc.integer({ min: 1, max: LIMITS.QUERY_MAX });

/**
 * Arbitrary for generating limits that exceed QUERY_MAX
 */
const tooHighLimitArb = fc.integer({ min: LIMITS.QUERY_MAX + 1, max: 50000 });

/**
 * Arbitrary for generating invalid limit values
 */
const invalidLimitArb = fc.oneof(
  fc.integer({ min: -1000, max: 0 }),
  fc.constant(undefined),
  fc.constant(null)
);

/**
 * Arbitrary for generating row counts
 */
const rowCountArb = fc.integer({ min: 0, max: 10000 });

/**
 * Arbitrary for generating valid RunQueryOutput objects
 */
const runQueryOutputArb = fc.record({
  columns: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 10 }),
  rows: fc.array(fc.object(), { minLength: 0, maxLength: 100 }),
  rowCount: fc.integer({ min: 0, max: 10000 }),
  truncated: fc.boolean(),
  executionTime: fc.integer({ min: 0, max: 60000 })
});

/**
 * Arbitrary for generating invalid output objects (missing fields)
 */
const invalidOutputArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant({}),
  fc.record({ columns: fc.array(fc.string()) }), // missing other fields
  fc.record({ 
    columns: fc.constant('not-an-array'), // wrong type
    rows: fc.array(fc.object()),
    rowCount: fc.integer(),
    truncated: fc.boolean(),
    executionTime: fc.integer()
  })
);

describe('Run Query Property Tests', () => {
  /**
   * Property 4: Truncation Flag Consistency
   * 
   * *For any* query result where the actual row count exceeds the limit, 
   * the result SHALL have `truncated: true` flag set.
   */
  describe('Property 4: Truncation Flag Consistency', () => {
    it('should enforce query limits within valid range', () => {
      fc.assert(
        fc.property(validLimitArb, (limit) => {
          const result = enforceQueryLimit(limit);
          expect(result).toBe(limit);
          expect(result).toBeGreaterThanOrEqual(1);
          expect(result).toBeLessThanOrEqual(LIMITS.QUERY_MAX);
        })
      );
    });

    it('should cap limits that exceed QUERY_MAX', () => {
      fc.assert(
        fc.property(tooHighLimitArb, (limit) => {
          const result = enforceQueryLimit(limit);
          expect(result).toBe(LIMITS.QUERY_MAX);
        })
      );
    });

    it('should return default for undefined/null/invalid limits', () => {
      fc.assert(
        fc.property(invalidLimitArb, (limit) => {
          const result = enforceQueryLimit(limit as number | undefined);
          expect(result).toBe(LIMITS.QUERY_DEFAULT);
        })
      );
    });

    it('should never exceed QUERY_MAX regardless of input', () => {
      fc.assert(
        fc.property(fc.integer({ min: -10000, max: 100000 }), (limit) => {
          const result = enforceQueryLimit(limit);
          expect(result).toBeLessThanOrEqual(LIMITS.QUERY_MAX);
          expect(result).toBeGreaterThan(0);
        })
      );
    });

    it('should always return a positive integer', () => {
      fc.assert(
        fc.property(
          fc.oneof(validLimitArb, tooHighLimitArb, invalidLimitArb),
          (limit) => {
            const result = enforceQueryLimit(limit as number | undefined);
            expect(Number.isInteger(result)).toBe(true);
            expect(result).toBeGreaterThan(0);
          }
        )
      );
    });

    it('should validate truncation flag is consistent when truncated is true', () => {
      fc.assert(
        fc.property(
          rowCountArb,
          validLimitArb,
          (rowCount, limit) => {
            // When truncated is true, the function should return true
            // (indicating there were more rows available)
            const result = isTruncationFlagConsistent(rowCount, limit, true);
            expect(result).toBe(true);
          }
        )
      );
    });

    it('should validate truncation flag is consistent when not truncated', () => {
      fc.assert(
        fc.property(
          validLimitArb,
          (limit) => {
            // When truncated is false, rowCount should be <= limit
            const rowCount = Math.floor(Math.random() * (limit + 1));
            const result = isTruncationFlagConsistent(rowCount, limit, false);
            expect(result).toBe(true);
          }
        )
      );
    });

    it('should detect inconsistent truncation flag', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          (limit) => {
            // If rowCount > limit and truncated is false, that's inconsistent
            const rowCount = limit + 10;
            const result = isTruncationFlagConsistent(rowCount, limit, false);
            // This should return false because rowCount > limit but truncated is false
            expect(result).toBe(false);
          }
        )
      );
    });
  });

  /**
   * Output Validation Tests
   */
  describe('Output Validation', () => {
    it('should validate correct RunQueryOutput objects', () => {
      fc.assert(
        fc.property(runQueryOutputArb, (output) => {
          // Ensure rows is an array of objects (not primitives)
          const validOutput = {
            ...output,
            rows: output.rows.map(r => (typeof r === 'object' && r !== null ? r : {}))
          };
          expect(isValidRunQueryOutput(validOutput)).toBe(true);
        })
      );
    });

    it('should reject invalid output objects', () => {
      fc.assert(
        fc.property(invalidOutputArb, (output) => {
          expect(isValidRunQueryOutput(output)).toBe(false);
        })
      );
    });

    it('should require all fields to be present', () => {
      // Missing columns
      expect(isValidRunQueryOutput({
        rows: [],
        rowCount: 0,
        truncated: false,
        executionTime: 0
      })).toBe(false);

      // Missing rows
      expect(isValidRunQueryOutput({
        columns: [],
        rowCount: 0,
        truncated: false,
        executionTime: 0
      })).toBe(false);

      // Missing rowCount
      expect(isValidRunQueryOutput({
        columns: [],
        rows: [],
        truncated: false,
        executionTime: 0
      })).toBe(false);

      // Missing truncated
      expect(isValidRunQueryOutput({
        columns: [],
        rows: [],
        rowCount: 0,
        executionTime: 0
      })).toBe(false);

      // Missing executionTime
      expect(isValidRunQueryOutput({
        columns: [],
        rows: [],
        rowCount: 0,
        truncated: false
      })).toBe(false);
    });

    it('should require correct types for all fields', () => {
      // columns must be array of strings
      expect(isValidRunQueryOutput({
        columns: [1, 2, 3], // numbers instead of strings
        rows: [],
        rowCount: 0,
        truncated: false,
        executionTime: 0
      })).toBe(false);

      // truncated must be boolean
      expect(isValidRunQueryOutput({
        columns: [],
        rows: [],
        rowCount: 0,
        truncated: 'false', // string instead of boolean
        executionTime: 0
      })).toBe(false);

      // executionTime must be number
      expect(isValidRunQueryOutput({
        columns: [],
        rows: [],
        rowCount: 0,
        truncated: false,
        executionTime: '100' // string instead of number
      })).toBe(false);
    });
  });
});
