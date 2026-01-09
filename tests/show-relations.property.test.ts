/**
 * Property-Based Tests for Show Relations Tool
 * 
 * **Feature: mysql-readonly-mcp, Property 10: Relationship Type Presence**
 * **Validates: Requirements 6.2**
 * 
 * Tests that for any relationship entry in show_relations result,
 * the entry SHALL contain a relationType field with value 'one-to-one' or 'one-to-many'.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  isValidShowRelationsOutput,
  isValidRelationInfo,
  ShowRelationsOutput
} from '../src/tools/show-relations';
import { RelationInfo } from '../src/types';

// Configure fast-check for minimum 100 iterations
fc.configureGlobal({ numRuns: 100 });

/**
 * Arbitrary for generating valid table names
 */
const tableNameArb = fc.string({ minLength: 1, maxLength: 64 })
  .filter(s => s.trim().length > 0 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s));

/**
 * Arbitrary for generating valid column names
 */
const columnNameArb = fc.string({ minLength: 1, maxLength: 64 })
  .filter(s => s.trim().length > 0 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s));

/**
 * Arbitrary for generating valid foreign key names
 */
const foreignKeyNameArb = fc.string({ minLength: 1, maxLength: 64 })
  .filter(s => s.trim().length > 0);

/**
 * Arbitrary for generating valid relationship types
 */
const relationTypeArb = fc.constantFrom('one-to-one', 'one-to-many') as fc.Arbitrary<'one-to-one' | 'one-to-many'>;

/**
 * Arbitrary for generating valid RelationInfo objects
 */
const validRelationInfoArb: fc.Arbitrary<RelationInfo> = fc.record({
  table: tableNameArb,
  column: columnNameArb,
  foreignKey: foreignKeyNameArb,
  relationType: relationTypeArb
});

/**
 * Arbitrary for generating valid ShowRelationsOutput objects
 */
const validShowRelationsOutputArb: fc.Arbitrary<ShowRelationsOutput> = fc.record({
  table: tableNameArb,
  referencedBy: fc.array(validRelationInfoArb, { minLength: 0, maxLength: 10 }),
  references: fc.array(validRelationInfoArb, { minLength: 0, maxLength: 10 }),
  message: fc.option(fc.string({ maxLength: 200 }), { nil: undefined })
});

/**
 * Arbitrary for generating invalid RelationInfo objects (missing relationType)
 */
const invalidRelationInfoMissingTypeArb = fc.record({
  table: tableNameArb,
  column: columnNameArb,
  foreignKey: foreignKeyNameArb
  // Missing relationType
});

/**
 * Arbitrary for generating invalid RelationInfo objects (wrong relationType)
 */
const invalidRelationInfoWrongTypeArb = fc.record({
  table: tableNameArb,
  column: columnNameArb,
  foreignKey: foreignKeyNameArb,
  relationType: fc.constantFrom('many-to-many', 'invalid', '', null, undefined, 123)
});

/**
 * Arbitrary for generating invalid RelationInfo objects (missing fields)
 */
const invalidRelationInfoMissingFieldsArb = fc.oneof(
  // Missing table
  fc.record({
    column: columnNameArb,
    foreignKey: foreignKeyNameArb,
    relationType: relationTypeArb
  }),
  // Missing column
  fc.record({
    table: tableNameArb,
    foreignKey: foreignKeyNameArb,
    relationType: relationTypeArb
  }),
  // Missing foreignKey
  fc.record({
    table: tableNameArb,
    column: columnNameArb,
    relationType: relationTypeArb
  }),
  // Null or undefined
  fc.constant(null),
  fc.constant(undefined),
  fc.constant({})
);


describe('Show Relations Property Tests', () => {
  /**
   * Property 10: Relationship Type Presence
   * 
   * *For any* relationship entry in show_relations result, the entry SHALL contain
   * a relationType field with value 'one-to-one' or 'one-to-many'.
   */
  describe('Property 10: Relationship Type Presence', () => {
    it('should validate that all valid ShowRelationsOutput objects pass validation', () => {
      fc.assert(
        fc.property(validShowRelationsOutputArb, (output) => {
          expect(isValidShowRelationsOutput(output)).toBe(true);

          // Verify table name
          expect(typeof output.table).toBe('string');

          // Verify referencedBy array exists
          expect(Array.isArray(output.referencedBy)).toBe(true);

          // Verify references array exists
          expect(Array.isArray(output.references)).toBe(true);
        })
      );
    });

    it('should ensure every relation in referencedBy has valid relationType', () => {
      fc.assert(
        fc.property(validShowRelationsOutputArb, (output) => {
          for (const rel of output.referencedBy) {
            // relationType must be present
            expect(rel.relationType).toBeDefined();

            // relationType must be one of the valid values
            expect(['one-to-one', 'one-to-many']).toContain(rel.relationType);
          }
        })
      );
    });

    it('should ensure every relation in references has valid relationType', () => {
      fc.assert(
        fc.property(validShowRelationsOutputArb, (output) => {
          for (const rel of output.references) {
            // relationType must be present
            expect(rel.relationType).toBeDefined();

            // relationType must be one of the valid values
            expect(['one-to-one', 'one-to-many']).toContain(rel.relationType);
          }
        })
      );
    });

    it('should validate individual RelationInfo objects have relationType', () => {
      fc.assert(
        fc.property(validRelationInfoArb, (rel) => {
          expect(isValidRelationInfo(rel)).toBe(true);

          // Verify relationType is present and valid
          expect(rel.relationType).toBeDefined();
          expect(['one-to-one', 'one-to-many']).toContain(rel.relationType);

          // Verify other required fields
          expect(typeof rel.table).toBe('string');
          expect(typeof rel.column).toBe('string');
          expect(typeof rel.foreignKey).toBe('string');
        })
      );
    });

    it('should reject RelationInfo objects missing relationType', () => {
      fc.assert(
        fc.property(invalidRelationInfoMissingTypeArb, (rel) => {
          expect(isValidRelationInfo(rel)).toBe(false);
        })
      );
    });

    it('should reject RelationInfo objects with invalid relationType values', () => {
      fc.assert(
        fc.property(invalidRelationInfoWrongTypeArb, (rel) => {
          expect(isValidRelationInfo(rel)).toBe(false);
        })
      );
    });

    it('should reject RelationInfo objects missing other required fields', () => {
      fc.assert(
        fc.property(invalidRelationInfoMissingFieldsArb, (rel) => {
          expect(isValidRelationInfo(rel)).toBe(false);
        })
      );
    });

    it('should reject ShowRelationsOutput with invalid referencedBy entries', () => {
      fc.assert(
        fc.property(
          tableNameArb,
          fc.array(invalidRelationInfoMissingTypeArb, { minLength: 1, maxLength: 3 }),
          (table, invalidRels) => {
            const output = {
              table,
              referencedBy: invalidRels,
              references: []
            };
            expect(isValidShowRelationsOutput(output)).toBe(false);
          }
        )
      );
    });

    it('should reject ShowRelationsOutput with invalid references entries', () => {
      fc.assert(
        fc.property(
          tableNameArb,
          fc.array(invalidRelationInfoMissingTypeArb, { minLength: 1, maxLength: 3 }),
          (table, invalidRels) => {
            const output = {
              table,
              referencedBy: [],
              references: invalidRels
            };
            expect(isValidShowRelationsOutput(output)).toBe(false);
          }
        )
      );
    });

    it('should reject null or undefined outputs', () => {
      expect(isValidShowRelationsOutput(null)).toBe(false);
      expect(isValidShowRelationsOutput(undefined)).toBe(false);
      expect(isValidShowRelationsOutput({})).toBe(false);
    });

    it('should reject outputs missing required arrays', () => {
      fc.assert(
        fc.property(tableNameArb, (table) => {
          // Missing referencedBy
          expect(isValidShowRelationsOutput({
            table,
            references: []
          })).toBe(false);

          // Missing references
          expect(isValidShowRelationsOutput({
            table,
            referencedBy: []
          })).toBe(false);

          // Missing table
          expect(isValidShowRelationsOutput({
            referencedBy: [],
            references: []
          })).toBe(false);
        })
      );
    });

    it('should handle empty arrays for relations (no relationships case)', () => {
      fc.assert(
        fc.property(tableNameArb, (table) => {
          const output: ShowRelationsOutput = {
            table,
            referencedBy: [],
            references: [],
            message: `No relationships found for table '${table}'`
          };

          expect(isValidShowRelationsOutput(output)).toBe(true);
          expect(output.referencedBy.length).toBe(0);
          expect(output.references.length).toBe(0);
        })
      );
    });

    it('should accept valid message field when present', () => {
      fc.assert(
        fc.property(
          tableNameArb,
          fc.array(validRelationInfoArb, { minLength: 0, maxLength: 5 }),
          fc.string({ maxLength: 200 }),
          (table, relations, message) => {
            const output: ShowRelationsOutput = {
              table,
              referencedBy: relations,
              references: [],
              message
            };

            expect(isValidShowRelationsOutput(output)).toBe(true);
          }
        )
      );
    });
  });
});
