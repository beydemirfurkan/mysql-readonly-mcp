/**
 * Property-Based Tests for Preview Data Tool
 * 
 * **Feature: mysql-readonly-mcp**
 * **Property 3: Row Limit Enforcement**
 * **Property 7: Text Truncation in Preview**
 * **Validates: Requirements 4.1, 4.4**
 * 
 * Tests that the preview data tool correctly enforces row limits
 * and truncates long text fields.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { 
  truncateText, 
  isTruncated, 
  enforceRowLimit,
  rowsContainOnlySpecifiedColumns
} from '../src/tools/preview-data';
import { LIMITS } from '../src/types';

// Configure fast-check for minimum 100 iterations
fc.configureGlobal({ numRuns: 100 });

/**
 * Arbitrary for generating strings of various lengths
 */
const anyStringArb = fc.string({ minLength: 0, maxLength: 500 });

/**
 * Arbitrary for generating strings longer than TEXT_TRUNCATE limit
 */
const longStringArb = fc.string({ 
  minLength: LIMITS.TEXT_TRUNCATE + 1, 
  maxLength: LIMITS.TEXT_TRUNCATE + 200 
});

/**
 * Arbitrary for generating strings shorter than or equal to TEXT_TRUNCATE limit
 */
const shortStringArb = fc.string({ 
  minLength: 0, 
  maxLength: LIMITS.TEXT_TRUNCATE 
});

/**
 * Arbitrary for generating valid row limit values
 */
const validLimitArb = fc.integer({ min: 1, max: LIMITS.PREVIEW_MAX });

/**
 * Arbitrary for generating invalid row limit values (too high)
 */
const tooHighLimitArb = fc.integer({ min: LIMITS.PREVIEW_MAX + 1, max: 10000 });

/**
 * Arbitrary for generating invalid row limit values (too low or invalid)
 */
const invalidLimitArb = fc.oneof(
  fc.integer({ min: -100, max: 0 }),
  fc.constant(undefined),
  fc.constant(null)
);

/**
 * Arbitrary for generating column names
 */
const columnNameArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'.split('')),
  { minLength: 1, maxLength: 15 }
);

/**
 * Arbitrary for generating row data with specified columns
 */
const rowWithColumnsArb = (columns: string[]) => {
  const entries = columns.map(col => fc.tuple(fc.constant(col), anyStringArb));
  return fc.tuple(...entries).map(pairs => 
    Object.fromEntries(pairs) as Record<string, unknown>
  );
};

describe('Preview Data Property Tests', () => {
  /**
   * Property 3: Row Limit Enforcement
   * 
   * *For any* query execution result, the number of returned rows SHALL NOT 
   * exceed the specified limit (default 10, max 100 for preview).
   */
  describe('Property 3: Row Limit Enforcement', () => {
    it('should return valid limits within range', () => {
      fc.assert(
        fc.property(validLimitArb, (limit) => {
          const result = enforceRowLimit(limit);
          expect(result).toBe(limit);
          expect(result).toBeGreaterThanOrEqual(1);
          expect(result).toBeLessThanOrEqual(LIMITS.PREVIEW_MAX);
        })
      );
    });

    it('should cap limits that exceed PREVIEW_MAX', () => {
      fc.assert(
        fc.property(tooHighLimitArb, (limit) => {
          const result = enforceRowLimit(limit);
          expect(result).toBe(LIMITS.PREVIEW_MAX);
          expect(result).toBeLessThanOrEqual(LIMITS.PREVIEW_MAX);
        })
      );
    });

    it('should return default for undefined/null/invalid limits', () => {
      fc.assert(
        fc.property(invalidLimitArb, (limit) => {
          const result = enforceRowLimit(limit as number | undefined);
          expect(result).toBe(LIMITS.PREVIEW_DEFAULT);
        })
      );
    });

    it('should always return a positive integer', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            validLimitArb,
            tooHighLimitArb,
            invalidLimitArb
          ),
          (limit) => {
            const result = enforceRowLimit(limit as number | undefined);
            expect(Number.isInteger(result)).toBe(true);
            expect(result).toBeGreaterThan(0);
          }
        )
      );
    });

    it('should never exceed PREVIEW_MAX regardless of input', () => {
      fc.assert(
        fc.property(fc.integer({ min: -1000, max: 100000 }), (limit) => {
          const result = enforceRowLimit(limit);
          expect(result).toBeLessThanOrEqual(LIMITS.PREVIEW_MAX);
        })
      );
    });
  });


  /**
   * Property 7: Text Truncation in Preview
   * 
   * *For any* text field in preview data results, if the original value length 
   * exceeds 200 characters, the returned value SHALL be truncated to 200 
   * characters with an ellipsis indicator.
   */
  describe('Property 7: Text Truncation in Preview', () => {
    it('should truncate strings longer than TEXT_TRUNCATE limit', () => {
      fc.assert(
        fc.property(longStringArb, (str) => {
          const result = truncateText(str);
          expect(typeof result).toBe('string');
          expect((result as string).length).toBe(LIMITS.TEXT_TRUNCATE + 3); // +3 for '...'
          expect((result as string).endsWith('...')).toBe(true);
        })
      );
    });

    it('should not truncate strings shorter than or equal to TEXT_TRUNCATE limit', () => {
      fc.assert(
        fc.property(shortStringArb, (str) => {
          const result = truncateText(str);
          expect(result).toBe(str);
          expect((result as string).endsWith('...')).toBe(str.endsWith('...'));
        })
      );
    });

    it('should preserve non-string values unchanged', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer(),
            fc.double(),
            fc.boolean(),
            fc.constant(null),
            fc.constant(undefined)
          ),
          (value) => {
            const result = truncateText(value);
            expect(result).toBe(value);
          }
        )
      );
    });

    it('should correctly identify truncated values', () => {
      fc.assert(
        fc.property(longStringArb, (str) => {
          const truncated = truncateText(str);
          expect(isTruncated(str, truncated)).toBe(true);
        })
      );
    });

    it('should correctly identify non-truncated values', () => {
      fc.assert(
        fc.property(shortStringArb, (str) => {
          const result = truncateText(str);
          expect(isTruncated(str, result)).toBe(false);
        })
      );
    });

    it('should preserve the first TEXT_TRUNCATE characters exactly', () => {
      fc.assert(
        fc.property(longStringArb, (str) => {
          const result = truncateText(str) as string;
          const expectedPrefix = str.substring(0, LIMITS.TEXT_TRUNCATE);
          expect(result.startsWith(expectedPrefix)).toBe(true);
        })
      );
    });

    it('should handle empty strings', () => {
      const result = truncateText('');
      expect(result).toBe('');
      expect(isTruncated('', result)).toBe(false);
    });

    it('should handle strings exactly at the limit', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: LIMITS.TEXT_TRUNCATE, maxLength: LIMITS.TEXT_TRUNCATE }),
          (str) => {
            const result = truncateText(str);
            expect(result).toBe(str);
            expect(isTruncated(str, result)).toBe(false);
          }
        )
      );
    });
  });

  /**
   * Property 8: Column Filtering
   * 
   * *For any* preview request with specified columns, the result rows 
   * SHALL contain only the specified columns and no others.
   */
  describe('Property 8: Column Filtering', () => {
    it('should validate rows contain only specified columns', () => {
      fc.assert(
        fc.property(
          fc.array(columnNameArb, { minLength: 1, maxLength: 5 }),
          (columns) => {
            // Create rows with exactly the specified columns
            const uniqueColumns = [...new Set(columns)];
            const rows = [
              Object.fromEntries(uniqueColumns.map(c => [c, 'value']))
            ];
            
            expect(rowsContainOnlySpecifiedColumns(rows, uniqueColumns)).toBe(true);
          }
        )
      );
    });

    it('should detect rows with extra columns', () => {
      fc.assert(
        fc.property(
          fc.array(columnNameArb, { minLength: 1, maxLength: 3 }),
          columnNameArb,
          (columns, extraColumn) => {
            const uniqueColumns = [...new Set(columns)];
            // Ensure extra column is not in the specified columns
            const safeExtraColumn = uniqueColumns.includes(extraColumn) 
              ? extraColumn + '_extra' 
              : extraColumn;
            
            // Create rows with an extra column
            const rows = [
              {
                ...Object.fromEntries(uniqueColumns.map(c => [c, 'value'])),
                [safeExtraColumn]: 'extra_value'
              }
            ];
            
            expect(rowsContainOnlySpecifiedColumns(rows, uniqueColumns)).toBe(false);
          }
        )
      );
    });

    it('should handle empty rows array', () => {
      fc.assert(
        fc.property(
          fc.array(columnNameArb, { minLength: 1, maxLength: 5 }),
          (columns) => {
            expect(rowsContainOnlySpecifiedColumns([], columns)).toBe(true);
          }
        )
      );
    });

    it('should be case-insensitive for column matching', () => {
      fc.assert(
        fc.property(
          fc.array(columnNameArb, { minLength: 1, maxLength: 3 }),
          (columns) => {
            const uniqueColumns = [...new Set(columns)];
            // Create rows with lowercase column names
            const rows = [
              Object.fromEntries(uniqueColumns.map(c => [c.toLowerCase(), 'value']))
            ];
            
            // Specified columns in uppercase
            const upperColumns = uniqueColumns.map(c => c.toUpperCase());
            
            expect(rowsContainOnlySpecifiedColumns(rows, upperColumns)).toBe(true);
          }
        )
      );
    });
  });
});
